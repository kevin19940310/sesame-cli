'use strict';

const path = require("path");

const npmlog = require('@sesame-cli/log');
const semver = require('semver');
const colors = require('colors')
const { Command } = require('commander');
const rootCheck = require('root-check');
const userHome = require('user-home');
const dotEnv = require('dotenv');
const {getNpmSemverVersion} = require('@sesame-cli/get-npm-info');
const exec = require('@sesame-cli/exec');

const pkg = require('../package.json');
const constants = require('./const');


let pathExistsSync;

async function core() {
    let  pathExists = await import('path-exists');
    pathExistsSync = pathExists.pathExistsSync;
    try {
        checkPkgVersion();
        checkRoot();
        checkUserHome();
        checkEnv();
        await checkGlobalUpdate();
        registryCommander();
    } catch (e) {
        npmlog.error(e.message);
        if(program.debug) {
            npmlog.error(e.message);
        }
    }
}

const program = new Command();
// 脚手架命令注册
function registryCommander () {
    program
        .name(Object.keys(pkg.bin)[0])
        .usage('<command> [options]')
        .version(pkg.version)
        .option('-d --debug', '开启调试模式', false)
        .option('-tp --targetPath <targetPath>', '是否指定本地调试文件路径', '');

    program
        .command('init [projectName]')
        .option('-f --force', '是否强制初始化')
        .action(exec);

    program
        .command('publish')
        .option('-fs --refreshServer', '更新远程git仓库')
        .option('-ft --refreshToken', '更新git token')
        .option('-fo --refreshOwner', '更新远程仓库类型')
        .option('-fpt --refreshPublishType', '更新静态资源服务器类型')
        .option('-bc --buildCmd <buildCmd>', '构建命令')
        .option('--prod', '是否发布为正式版')
        .option('--sshUser <sshUser>', '模板服务器用户名' )
        .option('--sshIp <sshIp>', '模板服务器域名或IP地址' )
        .option('--sshPath <sshPath>', '模板服务器上传路径' )
        .action(exec)

    program.on('option:debug', function (){
        if(program.opts().debug) {
            process.env.LOG_LEVEL = 'verbose'
        } else {
            process.env.LOG_LEVEL = 'info'
        }
        npmlog.level = process.env.LOG_LEVEL;
    })

    program.on('option:targetPath', function () {
        process.env.CLI_TARGET_PATH = program.opts().targetPath;
    })

    program.on('command:*', function (obj) {
        npmlog.error(colors.red(`未知的命令：${obj[0]}`))
        const availableCommands = program.commands.map(cmd => cmd.name())
        if(availableCommands.length > 0 ) {
            console.info(colors.green(`可用命令：${availableCommands.join(',')}`));
        }
    })

    program.parse(process.args);

    if(program.args && program.args.length < 1) {
        program.help();
        console.log('');
    }
}

// 检查脚手架版本
function  checkPkgVersion() {
    npmlog.notice('cli', pkg.version);
}

// 对root权限降级处理
function checkRoot() {
    rootCheck()
}

// 检查用户主目录
function checkUserHome() {
    if(!userHome || !pathExistsSync(userHome)) {
        throw new Error(colors.red('当前用户主目录不存在!'));
    }
}

// 检查系统环境变量 并设置环境变量
function checkEnv() {
    const dotEnvPath = path.resolve(userHome, '.env');
    if(pathExistsSync(dotEnvPath)) {
        dotEnv.config({
            path: dotEnvPath
        })
    }
    createDefaultConfig();
}

// 创建默认的环境变量
function createDefaultConfig() {
    const cliConfig = {}
    if(process.env.CLI_HOME) {
        cliConfig['cliHome'] = path.join(userHome, process.env.CLI_HOME);
    } else {
        cliConfig['cliHome'] = path.join(userHome, constants.DEFAULT_CLI_HOME);
    }
    process.env.CLI_HOME_PATH = cliConfig.cliHome;
}

// 检查cli版本提示更新
async function checkGlobalUpdate() {
    // 获取当前版本号和模块名
    const currentVersion = pkg.version;
    const npmName = pkg.name;
    // 获取最新的版本号
     const lastVersion = await getNpmSemverVersion(npmName, currentVersion);
     if (lastVersion && semver.gt(lastVersion, currentVersion)){
        npmlog.warn(colors.yellow(`请手动更新${npmName}，当前版本${currentVersion}, 最新版本${lastVersion}
        更新命令：npm install -g ${npmName}`));
     }
}

module.exports = core;
