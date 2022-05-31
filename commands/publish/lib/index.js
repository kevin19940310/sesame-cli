'use strict';
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

const Command = require('@sesame-cli/command');
const npmlog = require("@sesame-cli/log");
const Git = require('@sesame-cli/git');


class CommandPublish extends Command {
    init() {
        // console.log(this._argv[0].buildCmd)
        this.options = {
            refreshServer:  this._argv[0].refreshServer,
            refreshToken:  this._argv[0].refreshToken,
            refreshOwner:  this._argv[0].refreshOwner,
            refreshPublishType: this._argv[0].refreshPublishType,
            buildCmd: this._argv[0].buildCmd,
            prod: this._argv[0].prod,
            sshUser: this._argv[0].sshUser,
            sshIp: this._argv[0].sshIp,
            sshPath: this._argv[0].sshPath,
        }
    }
    async exec() {
        try {
            const startTime = new Date();
            // 1. 初始化检查
            await this.prepare();
            // 2. Git Flow自动化
            const git = new Git(this.projectInfo, this.options);
            await git.prepare();
            await git.commit();
            // 3. 云构建和云发布
            await git.publish();
            const endTime = new Date();
            npmlog.info('本次发布耗时：', Math.floor((endTime - startTime) / 1000) + '秒')
        } catch (e) {
            npmlog.error('init:',e.message);
        }
    }
    async prepare() {
        // 1. 确认项目是否为npm项目
        const projectPath = process.cwd();
        const pkgPath = path.resolve(projectPath, 'package.json');
        npmlog.verbose('package.json', pkgPath);
        if (!fs.existsSync(pkgPath)) {
            throw new Error('package.json 不存在!');
        }
        // 2. 确认是否包含build命令、name、version
        const pkg = fse.readJsonSync(pkgPath);
        const { name, version, scripts } = pkg;
        npmlog.verbose('package.json',name, version, scripts);
        if(!name || !version || !scripts || !scripts.build) {
            throw new Error('package.json信息不全, 请检查是否存在name、version、scripts(需要提供build命令!)');
        }
        this.projectInfo = { name, version, dir: projectPath };
    }
}

function init (argv) {
    return  new CommandPublish(argv);
}

module.exports = init
module.exports.InitCommand = CommandPublish;
