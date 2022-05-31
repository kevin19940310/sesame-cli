'use strict';
const fs = require('fs');

const cliSpinner = require('cli-spinner');
const cp = require("child_process");

function isObject(obj) {
    return  Object.prototype.toString.call(obj) === '[object Object]';
}

function spinner(str) {
    const Spinner = cliSpinner.Spinner;
    const spinner = new Spinner(`${str}...  %s`);
    spinner.setSpinnerString('|/-\\');
    spinner.start();
    return spinner
}

function  sleep(timeout = 1000) {
    return new Promise(resolve => setTimeout(resolve, timeout))
}

function exec(command,args,options) {
    const win32= process.platform === 'win32';

    const cmd = win32 ? 'cmd' : command;
    const cmdArgs = win32 ? ['/c'].concat(args) : args;

    return cp.spawn(cmd, cmdArgs, options || {});
}
function execAsync(command, args, options) {
    return new Promise((resolve, reject) => {
        const p = exec(command,args,options);
        p.on('error', reject);
        p.on('exit', resolve);
    })
}


function readFile(path, options={}) {
    if(fs.existsSync(path)) {
        const buffer = fs.readFileSync(path);
        if(buffer) {
            if(options.toJson) {
                return buffer.toJSON();
            }
            return buffer.toString();
        }
    }
    return null;
}

function writeFile(path, data, {rewrite = true} = {}) {
    if(fs.existsSync(path)) {
        if(rewrite) {
            fs.writeFileSync(path,data);
            return true;
        } else {
            return false;
        }
    } else {
        fs.writeFileSync(path,data);
        return true;
    }
}

module.exports = {
    isObject,
    spinner,
    sleep,
    exec,
    execAsync,
    readFile,
    writeFile
};

