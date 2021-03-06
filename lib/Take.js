/*
 * SMotion - Stop Motion Animation in a Web Browser
 * Copyright (C) 2017 Chris Luby <clubycoder@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
"use strict";

const mkdirp = require("mkdirp");
const fs = require('node-fs-extra');
const path = require('path');
const ncp = require('ncp');
const execSync = require('child_process').execSync;

function walkDirSync(dir, callback) {
	const files = fs.readdirSync(dir);
	files.forEach(function(file) {
		if (fs.statSync(path.join(dir, file)).isDirectory()) {
			walkDirSync(path.join(dir, file), callback);
		} else {
			callback(path.join(dir, file));
		}
	});
}

module.exports = {
	"getTakeDir": function(take) {
		const takeDir = take.scene + "/" + take.take;
		return takeDir;
	},
  "fixTake": function(take) {
		const takeDir = this.getTakeDir(take) + "/";
    function fixPath(path) {
      if ((path) && (path.indexOf(takeDir) == 0)) {
        path = path.substr(takeDir.length);
      }
      return path;
    }
    take.video = fixPath(take.video);
    if (take.frames) {
      for (let frameNum = 0; frameNum < take.frames.length; frameNum++) {
        const frame = take.frames[frameNum];
        frame.image = fixPath(frame.image);
        if (!frame.note) {
          if (frame.notes) {
            frame.note = frame.notes;
          } else {
            frame.note = "";
          }
          frame.notes = undefined;
        }
      }
    }
    return take;
  },
	"getList": function(config) {
		const takes = [];
    const self = this; // Alias to keep this around in the below closure
		walkDirSync(config.takesDir, function(filename) {
			if (path.basename(filename) == "take.json") {
				try {
					const take = self.fixTake(JSON.parse(fs.readFileSync(filename, "utf8")));
          take.dir = self.getTakeDir(take);
					takes.push({"take": take});
				} catch (e) {
					console.log("Failed to load " + filename + "! ", e.toString());
					takes.push({"err": "Failed to load " + filename + "! " + e.toString()});
				}
			}
		});
		return takes;
	},
	"newTake": function(config, take, takeToCopy) {
		const takeDir = this.getTakeDir(take);
		let newTake = take;
		if (!fs.existsSync(config.takesDir + "/" + takeDir)) {
      if (takeToCopy) {
        newTake = this.copyTake(config, take, takeToCopy);
      } else {
        newTake = this.saveTake(config, take);
      }
		} else {
			throw "Scene and/or Take already exists!";
		}
		return newTake;
	},
  "copyTake": function(config, take, takeToCopy) {
		const takeDir = this.getTakeDir(take);
		const takeToCopyDir = this.getTakeDir(takeToCopy);
    fs.copySync(config.takesDir + "/" + takeToCopyDir, config.takesDir + "/" + takeDir);
    takeToCopy.scene = take.scene;
    takeToCopy.take = take.take;
    takeToCopy.fps = take.fps;
    if ((takeToCopy.video) && (fs.existsSync(config.takesDir + "/" + takeDir + "/" + takeToCopy.video))) {
				fs.unlinkSync(config.takesDir + "/" + takeDir + "/" + takeToCopy.video);
    }
    takeToCopy.video = undefined;
    return this.saveTake(config, takeToCopy);
  },
	"saveTake": function(config, take) {
		const takeDir = this.getTakeDir(take);
		mkdirp.sync(config.takesDir + "/" + takeDir);
		const filename = config.takesDir + "/" + takeDir + "/take.json";
    take.dir = undefined;
		fs.writeFileSync(filename, JSON.stringify(take, null, 2), "utf8");
    take.dir = takeDir;
		return take;
	},
  "deleteTake": function(config, take) {
		const takeDir = this.getTakeDir(take);
    fs.removeSync(config.takesDir + "/" + takeDir);
  },
	"getDefaultFrame": function() {
		return {
			"image": "/images/frame-default.png",
			"note": ""
		};
	},
	"fixupFrames": function(config, take, reverse) {
    const self = this; // Alias to keep this around in the below closure
		function fixFrame(frameNum) {
			const frame = take.frames[frameNum];
			const filename = self.getFrameImageFilename(take, frameNum);
			if ((frame.image.indexOf("frame-default.png") < 0) && (frame.image != filename)) {
				fs.renameSync(
          config.takesDir + "/" + take.dir + "/" + frame.image,
          config.takesDir + "/" + take.dir + "/" + filename
        );
				frame.image = filename;
			}
    }

    if (reverse) {
      for (let frameNum = (take.frames.length - 1); frameNum >= 0; frameNum--) {
        fixFrame(frameNum);
		  }
    } else {
      for (let frameNum = 0; frameNum < take.frames.length; frameNum++) {
        fixFrame(frameNum);
		  }
    }
	},
	"removeCurrentFrame": function(config, take) {
		if (take.currentFrame < take.frames.length) {
			const frame = take.frames[take.currentFrame];
			if ((frame.image.indexOf("frame-default.png") < 0) &&
          (fs.existsSync(config.takesDir + "/" + take.dir + "/" + frame.image))) {
				fs.unlinkSync(config.takesDir + "/" + take.dir + "/" + frame.image);
			}
			take.frames.splice(take.currentFrame, 1);
			this.fixupFrames(config, take);
			this.saveTake(config, take);
		}
		return take;
	},
	"insertAtCurrentFrame": function(config, take) {
		take.frames.splice(take.currentFrame, 0, this.getDefaultFrame());
		this.fixupFrames(config, take, true);
		this.saveTake(config, take);
		return take;
	},
	"getFrameImageFilename": function(take, frameNum) {
		function pad(num, size) {
			const s = "000000000" + num;
			return s.substr(s.length - size);
		}

		const imagesDir = "images";
		const filename = imagesDir + "/" + pad(frameNum, 8) + ".png";
		return filename;
	},
	"saveCurrentFrameImage": function(config, take, data) {
		const imagesDir = "images";
		mkdirp.sync(config.takesDir + "/" + take.dir + "/" + imagesDir);
		const filename = this.getFrameImageFilename(take, take.currentFrame);
		if (data.indexOf("data:image/png;base64,") == 0) {
			const buf = new Buffer(data.substr(22), "base64");
			fs.writeFileSync(config.takesDir + "/" + take.dir + "/" + filename, buf);
			take.frames[take.currentFrame].image = filename;
		} else {
			throw "Unknown image type";
		}
		this.saveTake(config, take);
		return take;
	},
	"render": function(config, take) {
    const imagesDir = "images";
    if ((take.frames) && (take.frames.length > 0)) {
      const filename = take.scene + " - " + take.take + ".mp4";
      if ((config.tools.ffmpeg) && (fs.existsSync(config.tools.ffmpeg))) {
        const cmd = config.tools.ffmpeg
        + ' -y'
        + ' -framerate ' + take.fps
        + ' -start_number 0'
        + ' -i "' + config.takesDir + "/" + take.dir + "/" + imagesDir + '/%08d.png"'
        + ' -pix_fmt yuv420p'
        + ' "' + config.takesDir + "/" + take.dir + "/" + filename + '"'
        ;
        execSync(cmd);
        take.video = filename;
      } else {
        throw "Can't find ffmpeg";
      }
      this.saveTake(config, take);
    } else {
      throw "No frames to render";
    }
		return take;
	}
};
