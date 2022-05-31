'use strict';
const path = require('path');
const fs = require('fs');
const userHome = require('user-home');
const fse = require('fs-extra');
const inquirer = require('inquirer');
const terminalLink = require('terminal-link');
const semver = require('semver');
const request = require('@sesame-cli/request');
const ChildProcess = require('child_process');

const SimpleGit = require('simple-git');
const npmlog = require("@sesame-cli/log");
const { readFile, writeFile, spinner } = require('@sesame-cli/utils');
const CloudBuild = require('@sesame-cli/cloudbuild');

const GitHub = require('./gitHub');
const Gitee = require('./gitee');

const DEFAULT_CLI_HOME = '.sesame-cli';
const GIT_ROOT_DIR = '.git';
const GIE_SERVER_FILE = '.git_server';
const GIT_TOKEN_FILE = '.git_token';
const GIT_LOGIN_FILE = '.git_login';
const GIT_IGNORE_FILE = '.gitignore';
const GIT_OWN_FILE = '.git_own';
const GIT_PUBLISH_FILE = '.git_publish';

const GITHUB = 'github';
const GITEE = 'gitee';
const REPO_OWNER_USER = 'user';
const REPO_OWNER_ORG = 'org';
const VERSION_RELEASE = 'release';
const VERSION_DEVELOP = 'dev';
const TEMPLATE_TEMP_DIR = 'cos';

const GIT_SERVER_TYPE = [
    {
        name: 'GitHub',
        value: GITHUB
    },
    {
        name: 'Gitee',
        value: GITEE
    }
];

const GIT_OWNER_TYPE = [
    {
        name: '个人',
        value: REPO_OWNER_USER
    },
    {
        name: '组织',
        value: REPO_OWNER_ORG
    }
]

const GIT_OWNER_TYPE_ONLY = [
    {
        name: '个人',
        value: REPO_OWNER_USER
    }
]

const GIT_PUBLISH_TYPE =[
    {
        name: 'OSS',
        value: 'oss',
    }
]

class Git {
    constructor(projectInfo, {
        refreshServer = false,
        refreshToken = false,
        refreshOwner = false ,
        refreshPublishType=false,
        buildCmd= '',
        prod = false,
        sshUser,
        sshIp,
        sshPath
    }) {
        const { name, version, dir} = projectInfo;
        this.name = name;   // 项目名
        this.version = version; // 项目版本
        this.dir = dir;  // 源码dir
        this.git = SimpleGit(dir);
        this.gitServer = null; // git实例
        this.homePath = null; //本地缓存目录
        this.user = null;  // git 用户
        this.orgs = null; // git 用户组织
        this.login = null; //  远程仓库登录名
        this.owner = null;  // 远程仓库类型
        this.refreshServer = refreshServer;  // 是否强制更新远程仓库
        this.refreshToken = refreshToken;  // 是否强制更新token
        this.refreshOwner = refreshOwner;  // 是否强制更新仓库类型
        this.refreshPublishType = refreshPublishType; // 是否强制更新静态资源服务器
        this.prod = prod; // 是否发布为正式版
        this.branch = null; /// 本地开发分支
        this.buildCmd = buildCmd;  // 构建命令
        this.gitPublish = null; // 静态资源服务器类型
        this.sshUser = sshUser; // 模板服务器用户名
        this.sshIp = sshIp; // 模板服务器Ip或域名
        this.sshPath = sshPath; // 模板服务器上传路径
    }
    async prepare() {
        this.checkHomePath();  // 检查缓存的主目录
        await this.checkGitServer(); // 检查远程仓库类型
        await this.checkGitToken();  //获取远程仓库token
        await this.getUserAndOrgs(); // 获取远程仓库用户及组织信息
        await this.checkGitOwner();  //确认远程仓库类型
        await this.checkRepo(); // 检查并创建远程仓库
        this.checkGitIgnore(); // 检查并创建gitignore文件
        await this.init();  //完成本地仓库初始化
    }

    async publish() {
        await this.preparePublish();  // 发布前的准备工作
        const cloudBuild = new CloudBuild(this, {
            buildCmd: this.buildCmd,
            type: this.gitPublish,
            prod: this.prod,
        })
        await cloudBuild.prepare();
        await cloudBuild.init();
        const ret = await cloudBuild.build();
        if(ret) {
            await this.uploadTemplate();
        }
        if(this.prod && ret) {
            // 打tag
            await this.checkTag();
            await this.checkoutBranch('master'); // 切换分支到master
            await this.mergeBranchToMaster(); // 将开发分支代码合并到master
            await this.pushRemoteRepo('master'); // 将代码推送到远程master分支
            await this.deleteLocalBranch(); // 删除本地开发分支
            await this.deleteRemoteBranch(); // 删除远程开发分支
        }
    }

    // 删除本地开发分支
    async deleteLocalBranch() {
        npmlog.info('开始删除本地开发分支', this.branch);
        await this.git.deleteLocalBranch(this.branch);
        npmlog.success('删除本地开发分支成功', this.branch);
    }
    // 删除远程开发分支
    async deleteRemoteBranch() {
        npmlog.info('开始删除远程开发分支', this.branch);
        await this.git.push(['origin', '--delete', this.branch]);
        npmlog.success('删除远程开发分支成功', this.branch);
    }
    // 合并开发分支到master分支
    async mergeBranchToMaster() {
        npmlog.info('开始合并代码', `${this.branch} -> master`);
        await this.git.mergeFromTo(this.branch, 'master');
        npmlog.success('代码合并成功', `${this.branch} -> master`);

    }
    // 检查tag，并创建tag推送到远程
    async checkTag() {
        npmlog.info('获取远程tag列表');
        const tag = `${VERSION_RELEASE}/${this.version}`;
        const tagList = await this.getRemoteBranchList(VERSION_RELEASE);
        if(tagList.includes(this.version)) {
            npmlog.success('远程 tag 已存在', tag);
            await this.git.push(['origin', `:refs/tags/${tag}`]);
            npmlog.success('远程tag已删除');
        }
        const localTagList = await this.git.tags();
        if(localTagList.all.includes(tag)) {
            npmlog.success('本地 tag 已存在', tag);
            await this.git.tag(['-d', tag]);
            npmlog.success('本地 tag 已删除', tag);
        }
        await this.git.addTag(tag);
        npmlog.success('本地 tag 创建成功', tag);
        await this.git.pushTags('origin');
        npmlog.success('远程 tag 推送成功', tag);
    }
    // 下载cos模板文件到本地
    async uploadTemplate() {
        if(this.sshPath && this.sshUser && this.sshIp) {
            const fileName = 'index.html';
            const res = await request({
                url:'cos/get',
                params: {
                    type: this.prod ? 'prod' : 'dev',
                    project: this.name,
                    file: fileName,
                }
            })
            if(res.code === 0 && res.data) {
                const response = await request({
                    url: res.data
                })
                if(response) {
                    const cosTemplateDir = path.resolve(this.homePath, TEMPLATE_TEMP_DIR, `${this.name}@${this.version}`);
                    console.log(cosTemplateDir);
                    if(!fs.existsSync(cosTemplateDir)) {
                        fse.mkdirpSync(cosTemplateDir);
                    } else {
                        fse.emptyDirSync(cosTemplateDir);
                    }
                    const templateFilePath = path.resolve(cosTemplateDir, fileName);
                    fse.createFileSync(templateFilePath);
                    fs.writeFileSync(templateFilePath,response)
                    npmlog.success('模板文件下载成功');
                    npmlog.info('开始上传文件模板至服务器');
                    const uploadCmd = `scp -r ${templateFilePath} ${this.sshUser}@${this.sshIp}:${this.sshPath}`;
                    const ret = ChildProcess.execSync(uploadCmd);
                    console.log(ret.toString());
                    npmlog.success('模板文件上传成功了');
                    fse.emptyDirSync(cosTemplateDir);
                }
            }
        }
    }
    // 云构建前代码检查
    async preparePublish() {
        npmlog.info('开始进行云构建前代码检查');
        const pkg = this.getPackageJson();
        if(this.buildCmd) {
            const buildCmdArray = this.buildCmd.split(' ');
            if(buildCmdArray[0] !== 'npm' && buildCmdArray[0] !== 'cnpm') {
                throw new Error('build 命令非法， 必须使用npm或cnpm');
            }
        } else {
            this.buildCmd = 'npm run build';
        }
        const buildCmdArray = this.buildCmd.split(' ');
        const lastCmd = buildCmdArray[buildCmdArray.length-1];
        if(!pkg.scripts || !Object.keys(pkg.scripts).includes(lastCmd)) {
            throw new Error(this.buildCmd + '命令不存在');
        }
        npmlog.success('代码预检查通过');

        const gitPublishFilePath = this.createPath(GIT_PUBLISH_FILE);
        let gitPublish = readFile(gitPublishFilePath);
        if(!gitPublish || this.refreshPublishType) {
            gitPublish = (await inquirer.prompt({
                type:'list',
                message:'请选择您想要上传代码的平台',
                name:'gitPublish',
                choices: GIT_PUBLISH_TYPE,
            })).gitPublish
            writeFile(gitPublishFilePath, gitPublish);
            npmlog.success('gitPublish类型写入成功', `${gitPublish} -> ${gitPublishFilePath}`);
        } else {
            npmlog.success('gitPublish获取成功', gitPublish);
        }
        this.gitPublish = gitPublish;
    }
    // 获取package.json
    getPackageJson() {
        const pkgPath = path.resolve(this.dir, 'package.json');
        if(!fs.existsSync(pkgPath)) {
            throw new Error('package.json 不存在!');
        }
        return fse.readJsonSync(pkgPath);
    }
    // 初始化
    async init() {
        const isInit = await this.getRemote();
        if(isInit) return;
        await this.initAndAddRemote();
        await this.initCommit();
    }
    // 推送本地代码到远程开发分支
    async commit() {
        // 1.生成开发分支
        await this.gitCorrectVersion()
        // 2.检查stash区
        await this.checkStash()
        // 检查代码冲突
        await this.checkConflicted();
        // 3. 检查未提交代码
        await this.checkNotCommit();
        // 4.切换开发分支
        await this.checkoutBranch(this.branch);
        // 5. 合并远程master分支到开发分支
        await this.pullRemoteMasterAndBranch();
        // 6. 将开发分支推送到远程仓库
        await this.pushRemoteRepo(this.branch);
    }
    // 合并远程代码到本地开发分支
    async pullRemoteMasterAndBranch() {
        const Spinner = spinner(`合并远程分支到本地`);
        npmlog.info(`合并 master -> ${this.branch}`);
        await this.pullRemoteRepo('master');
        npmlog.success(`合并远程 master 分支代码成功!`);
        await this.checkConflicted();
        npmlog.info('检查远程开发分支');
        const remoteBranchList = await this.getRemoteBranchList();
        if(remoteBranchList.indexOf(this.version) >= 0) {
            npmlog.info(`合并远程${this.branch} -> 到本地 ${this.branch}`);
            await this.pullRemoteRepo(this.branch);
            npmlog.success(`合并远程 ${this.branch} 分支代码成功`);
            await this.checkConflicted();
        } else {
            npmlog.success(`不存在远程分支 ${this.branch}`);
        }
        Spinner.stop(true);
    }
    // 切换到指定分支
    async checkoutBranch(branch) {
        const localBranchList = await this.git.branchLocal();
        if(localBranchList.all.indexOf(branch) >= 0) {
            await this.git.checkout(branch);
        } else {
            await this.git.checkoutLocalBranch(branch);
        }
        npmlog.success(`分支切换到${branch}`);
    }
    // 检查stash区是否存在文件
    async checkStash() {
        npmlog.info('检查stash记录');
        const stashList =await this.git.stashList();
        if(stashList.all.length > 0) {
            const stashPop = (await inquirer.prompt({
                type:'list',
                message:'是否将stash区内容pop出来',
                name: 'stashPop',
                choices:[
                    {
                        name:'是',
                        value: true
                    },
                    {
                        name:'否',
                        value: false
                    },
                ],
            })).stashPop;
            if(stashPop) {
                await this.git.stash(['pop']);
                npmlog.success('stash pop成功');
            }
        }
    }

    async gitCorrectVersion() {
        // 1.获取远程发布分支
        // 版本号规范： release/x.y.z dev/x.y.z
        // 版本号递增规范: major/minor/path
        npmlog.info('获取代码分支');
        const Spinner = spinner('获取代码分支');
        const remoteBranchList = await this.getRemoteBranchList(VERSION_RELEASE);
        Spinner.stop(true);
        let releaseVersion = null;
        if(remoteBranchList && remoteBranchList.length > 0) {
            releaseVersion = remoteBranchList[0];
        }
        npmlog.verbose('releaseVersion', releaseVersion);
        // 2. 生成本地开发分支
        const devVersion = this.version;
        if(!releaseVersion) {
            this.branch = `${VERSION_DEVELOP}/${devVersion}`;
        } else if(semver.gt(devVersion, releaseVersion)) {
            npmlog.info('当前版本大于线上最新版本', `${devVersion} >= ${releaseVersion}`);
            this.branch = `${VERSION_DEVELOP}/${devVersion}`
        } else {
            npmlog.info('当前线上版本大于本地版本', `${devVersion} < ${releaseVersion}`);
            const incType = (await inquirer.prompt({
                type: 'list',
                name: 'incType',
                message: '自动升级版本，请选择升级版本类型',
                choices: [
                    {
                          name: `小版本（${releaseVersion} -> ${semver.inc(releaseVersion, 'patch')}）`,
                          value: 'patch',
                    },
                    {
                        name: `中版本（${releaseVersion} -> ${semver.inc(releaseVersion, 'minor')}）`,
                        value: 'minor',
                    },
                    {
                        name: `大版本（${releaseVersion} -> ${semver.inc(releaseVersion, 'major')}）`,
                        value: 'major',
                    },
                ],
            })).incType;
            const incVersion = semver.inc(releaseVersion,incType);
            this.branch = `${VERSION_DEVELOP}/${incVersion}`;
            this.version = incVersion;
        }
        npmlog.verbose('本地开发分支',this.branch);
        // 3. 将version同步到package.json
        this.syncVersionToPackageJson();
    }

    syncVersionToPackageJson() {
        const pkg = fse.readJsonSync(`${this.dir}/package.json`);
        if(pkg && pkg.version !== this.version) {
            pkg.version = this.version;
            fse.writeJsonSync(`${this.dir}/package.json`, pkg, { spaces: 2 });
        }
    }

    async getRemoteBranchList(type) {
        const remoteList = await this.git.listRemote(['--refs']);
        let reg;
        if(type === VERSION_RELEASE) {
            reg = /.+?refs\/tags\/release\/(\d+\.\d+\.\d+)/g;
        } else {
            reg = /.+?refs\/heads\/dev\/(\d+\.\d+\.\d+)/g;
        }
        return remoteList.split('\n').map(remote => {
            const match = reg.exec(remote);
            reg.lastIndex = 0;
            if(match && semver.valid(match[1])) {
                return match[1]
            }
        }).filter(_ => _).sort((a,b) => {
            if(semver.lte(b,a)) {
                if(a === b) return 0
                return -1
            }
            return 1;
        });
    }

    async initCommit() {
        await this.checkConflicted();  // 检查代码冲突
        await this.checkNotCommit(); // 检查未提交代码
        if(await this.checkRemoteMaster()) {  // 检查远程是否存在master分支
            const Spinner = spinner('合并远程master分支');
            await this.pullRemoteRepo('master', { // 合并远程master分支
                '--allow-unrelated-histories': null,  // 可以让两个没有关系的代码分支进行合并
            });
            Spinner.stop(true);
        } else {
            const Spinner = spinner('推送代码至远程master分支');
            await this.pushRemoteRepo('master');  // 推送代码至远程master分支
            Spinner.stop(true);
        }
    }

    async pullRemoteRepo(branchName, options) {
        npmlog.info(`同步远程${branchName}分支`);
        await this.git.pull('origin', branchName, options)
            .catch(err => {
                npmlog.error(err.message);
            })
    }

    async pushRemoteRepo(branchName) {
        npmlog.info(`推送代码至${branchName}分支`);
        const Spinner = spinner(`推送代码至${branchName}分支`);
        await this.git.push('origin', branchName);
        Spinner.stop(true);
        npmlog.success('推送代码成功');
    }

    async checkRemoteMaster() {
        return (await this.git.listRemote(['--refs'])).indexOf('refs/heads/master') >= 0
    }

    async checkNotCommit() {
        const status = await this.git.status();
        if(
            status.not_added.length > 0 ||
            status.created.length > 0 ||
            status.deleted.length > 0 ||
            status.modified.length > 0 ||
            status.renamed.length > 0
        ) {
            npmlog.verbose('git status', status);
            await this.git.add(status.not_added);
            await this.git.add(status.created);
            await this.git.add(status.deleted);
            await this.git.add(status.modified);
            await this.git.add(status.renamed);
            let message;
            while (!message) {
                message = ( await inquirer.prompt({
                    type: 'text',
                    name: 'message',
                    message: '请输入commit信息:'
                })).message
            }
            await this.git.commit(message);
            npmlog.success('本地commit提交成功!');
        }
    }

    async checkConflicted() {
        npmlog.info('代码冲突检查');
        const status = await this.git.status();
        if (status.conflicted.length > 0) {
            throw new Error('当前代码存在冲突, 请手动处理合并后再试');
        }
        npmlog.success('代码冲突检查通过!');
    }

    async getRemote() {
        const gitPath = path.resolve(this.dir, GIT_ROOT_DIR);
        this.remote = this.gitServer.getRemote(this.login, this.name);
        if(fs.existsSync(gitPath)) {
            npmlog.success('git已完成初始化');
            return true;
        } else {
            return false;
        }
    }

    async initAndAddRemote() {
        npmlog.info('执行 git 初始化');
        await this.git.init(this.dir);
        const remotes = await this.git.getRemotes();
        npmlog.verbose('git remotes', remotes);
        if(!remotes.find(item => item.name === 'origin')) {
            await this.git.addRemote('origin', this.remote);
        }
        npmlog.success('完成git初始化');
    }

    async checkGitServer() {
        const gitServerPath = this.createPath(GIE_SERVER_FILE);
        let gitServer = readFile(gitServerPath);
        if(!gitServer || this.refreshServer) {
            gitServer = (await inquirer.prompt({
                type: "list",
                name: "gitServer",
                message: "请选择您想要托管的git平台",
                default: GITHUB,
                choices: GIT_SERVER_TYPE,
            })).gitServer;
            writeFile(gitServerPath, gitServer);
            npmlog.success('git server写入成功', `${gitServer} -> ${gitServerPath}`);
        } else {
            npmlog.success('git server获取成功');
        }
        this.gitServer = this.createGitServer(gitServer);
        if(!this.gitServer) {
            throw new Error('GitServer初始化失败');
        }
    }

    async checkGitToken () {
        const tokenPath = this.createPath(GIT_TOKEN_FILE);
        let token = readFile(tokenPath);
        if (!token || this.refreshToken) {
            npmlog.warn(this.gitServer.type + ' token未生成',  `请生成${this.gitServer.type} token ${terminalLink('文档地址', this.gitServer.getTokenHelpUrl())}`);
            token = (await inquirer.prompt({
                type: 'password',
                name: 'token',
                message: '请输入token',
                default: '',
                validate: function (v) {
                    const done = this.async();
                    setTimeout(function () {
                        if(!v) {
                            done('请输入token');
                            return;
                        }
                        done(null, true);
                    }, 0)
                },
            })).token;
            writeFile(tokenPath, token);
            npmlog.success('token写入成功',  `写入路径${tokenPath}`);
        } else {
            npmlog.success('token获取成功');
        }
        this.token = token;
        this.gitServer.setToken(token);
    }

    async checkGitOwner () {
        const ownerPath = this.createPath(GIT_OWN_FILE);
        const loginPath = this.createPath(GIT_LOGIN_FILE);
        let owner = readFile(ownerPath);
        let login = readFile(loginPath);
        if(!owner || !login || this.refreshOwner) {
            owner = (await inquirer.prompt(
                {
                    type: "list",
                    name: "owner",
                    message: "请选择仓库类型",
                    default: GITHUB,
                    choices: this.orgs.length > 0 ? GIT_OWNER_TYPE : GIT_OWNER_TYPE_ONLY,
                })).owner;
            if(owner === REPO_OWNER_USER) {
                login = this.user.login
            } else {
                login = (await inquirer.prompt({
                    type: 'list',
                    name: 'login',
                    message: '请选择组织',
                    choices: this.orgs.map(org => {
                       return {
                           name: org.login,
                           value: org.login,
                       }
                    })
                })).login;
            }
            writeFile(ownerPath, owner);
            writeFile(loginPath, login);
            npmlog.success('owner写入成功',  `写入路径${ownerPath}`);
            npmlog.success('login写入成功',  `写入路径${loginPath}`);
        } else {
            npmlog.success('owner获取成功');
            npmlog.success('login获取成功');
        }
        this.login = login;
        this.owner = owner;
    }

    async checkRepo () {
        let repo = await this.gitServer.getRepo(this.login, this.name);
        if(!repo) {
            let Spinner = spinner('开始创建远程仓库');
            try {
                if(this.owner === REPO_OWNER_USER) {
                    repo= await this.gitServer.createRepo(this.name);
                } else {
                    repo = await this.gitServer.createOrgRepo(this.name, this.login);
                }
                npmlog.success('远程仓库创建成功')
            } catch (e) {
                npmlog.error(e);
            } finally {
                Spinner.stop(true);
            }
        } else {
            npmlog.success('远程仓库信息获取成功')
        }
        this.repo = repo;
    }

    checkGitIgnore() {
        const gitIgnorePath = path.resolve(this.dir, GIT_IGNORE_FILE);
        if(!fs.existsSync(gitIgnorePath)) {
            writeFile(gitIgnorePath, '.DS_Store\n' +
                'node_modules\n' +
                '/dist\n' +
                '\n' +
                '\n' +
                '# local env files\n' +
                '.env.local\n' +
                '.env.*.local\n' +
                '\n' +
                '# Log files\n' +
                'npm-debug.log*\n' +
                'yarn-debug.log*\n' +
                'yarn-error.log*\n' +
                'pnpm-debug.log*\n' +
                '\n' +
                '# Editor directories and files\n' +
                '.idea\n' +
                '.vscode\n' +
                '*.suo\n' +
                '*.ntvs*\n' +
                '*.njsproj\n' +
                '*.sln\n' +
                '*.sw?')
            npmlog.success(`自动写入${GIT_IGNORE_FILE}文件成功`);
        }
    }

    async getUserAndOrgs() {
        const Spinner = spinner('获取远程仓库用户及组织信息');
        this.user = await this.gitServer.getUser();
        Spinner.stop(true);
        if(!this.user) {
            throw new Error('用户信息获取失败');
        }
        this.orgs  = await this.gitServer.getOrg();
        if(!this.orgs || !Array.isArray(this.orgs)) {
            throw new Error('组织信息获取失败');
        }
        npmlog.success(this.gitServer.type, '用户和组织信息获取成功');
    }

    createGitServer(gitServer='') {
        if(gitServer === GITHUB) {
            return new GitHub();
        } else if(gitServer === GITEE) {
            return new Gitee();
        }
        return  null;
    }

    createPath(file) {
        const rootDIr = path.resolve(this.homePath, GIT_ROOT_DIR);
        const filePath = path.resolve(rootDIr, file);
        fse.ensureDirSync(rootDIr);
        return filePath;
    }

    checkHomePath() {
        if (this.homePath) {
            if (process.env.CLI_HOME_PATH) {
                this.homePath = process.env.CLI_HOME_PATH;
            }
        } else {
            this.homePath = path.resolve(userHome, DEFAULT_CLI_HOME)
        }
        npmlog.verbose(this.homePath);
        fse.ensureDirSync(this.homePath);
        if(!fs.existsSync(this.homePath)) {
            throw new Error('用缓存主目录不存在！');
        }
    }

}

module.exports = Git;
