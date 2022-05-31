'use strict';

const Package = require("@sesame-cli/package");
const {exec: spawn} = require("@sesame-cli/utils");
const path = require("path");
const npmlog = require("@sesame-cli/log");

const SETTINGS = {
    init: '@sesame-cli/init',
    publish: '@sesame-cli/publish',
}
const CACHE_DIR= 'dependencies';

async function exec() {
    let targetPath = process.env.CLI_TARGET_PATH;
    let storeDir = '';
    let pkg;
    const homePath = process.env.CLI_HOME_PATH;
    const cmdObj = arguments[arguments.length - 1];
    const cmdName = cmdObj.name();
    const packageName = SETTINGS[cmdName];
    const packageVersion = 'latest';
    // 未指定执行文件目录
    if(!targetPath) {
        targetPath = path.resolve(homePath, CACHE_DIR);
        storeDir = path.resolve(targetPath, 'node_modules');
        pkg = new Package({
            targetPath,
            storeDir,
            packageName,
            packageVersion,
        });

        if(await pkg.exists()) {
            // 更新package
            await pkg.update();
        } else {
            await pkg.install();
            // 安装package
        }
    } else {
        // 指定了执行文件目录
        pkg = new Package({
            targetPath,
            packageName,
            packageVersion,
        });
    }
    npmlog.verbose('exec:targetPath', targetPath);
    npmlog.verbose('exec:homePath', homePath);
    npmlog.verbose('exec:storeDir', storeDir);
    npmlog.verbose('exec:packageName', packageName);
    const rootFile =  await pkg.getRootFilePath();
    if(rootFile) {
        try{
            const args = Array.from(arguments)
            const cmd = args[args.length - 1];
            const o = Object.create(null);
            Object.keys(cmd).map(key => {
                if(cmd.hasOwnProperty(key) && !key.startsWith('_') && key !=='parent') {
                    o[key] = cmd[key];
                }
            })
            args[args.length - 1] = o

            const code = `require("${rootFile}").call(null, ${JSON.stringify(args)});`
            const child = spawn('node', ['-e', code], {
                cwd: process.cwd(),
                stdio:'inherit'
            })
            child.on('error', e=> {
                console.error(e);
                process.exit(1);
            })
            child.on('exit', e=> {
                npmlog.verbose('exec:命令执行成功：'+e)
                process.exit(e);
            })
        }catch (e) {
            npmlog.error(e.message);
        }
    }
}
module.exports = exec;
