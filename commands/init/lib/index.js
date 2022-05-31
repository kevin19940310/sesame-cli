'use strict';
const fs = require("fs");
const glob = require('glob');
const ejs = require('ejs');
const Command = require('@sesame-cli/command');
const { spinner, sleep, execAsync } = require('@sesame-cli/utils');
const npmlog = require('@sesame-cli/log');
const inquirer = require('inquirer');
const fse = require("fs-extra");
const semver = require('semver');
const path = require('path');
const userHome = require('user-home');
const Package = require('@sesame-cli/package');

const getProjectTemplate = require("./getProjectTemplate");

const TYPE_PROJECT = 'project';
const TYPE_COMPONENT = 'component';
const TEMPLATE_TYPE_NORMAL = 'normal';
const TEMPLATE_TYPE_CUSTOM = 'custom';
const WHITE_COMMAND = ['npm', 'cnpm', 'tnpm'];

class InitCommand extends Command{
  init () {
    this.projectName = this._argv[0];
    this.force = !! this._argv[1].force;
    npmlog.verbose('init:projectName', this.projectName);
    npmlog.verbose('init:force', this.force);
  }
  async exec () {
    try {
      // 准备阶段
      const projectInfo = await this.prepare();
      if(projectInfo) {
        // 下载模板
        npmlog.verbose('exec:projectInfo', projectInfo);
        this.projectInfo = projectInfo;
        await this.downLoadTemplate()
        // 安装模板
        await this.installTemplate()
      }
    } catch (e) {
      npmlog.error('init:',e.message);
    }
  }

  // 安装模板
  async installTemplate () {
    if (this.templateInfo) {
      if (!this.templateInfo.type) {
        this.templateInfo.type = TEMPLATE_TYPE_NORMAL;
      }
      if(this.templateInfo.type === TEMPLATE_TYPE_NORMAL) {
        // 标准安装
        await this.installNormalTemplate();
      } else if(this.templateInfo.type === TEMPLATE_TYPE_CUSTOM) {
        // 自定义模板
        await this.installCustomTemplate();
      } else {
        throw new Error('项目模板信息无法识别');
      }
    } else {
      throw new Error('项目信息模板不存在！')
    }
  }

  // 检查白名单命令
  checkCommand (cmd) {
    if(WHITE_COMMAND.includes(cmd)) {
      return cmd
    }
    return null
  }

  // 执行命令
  async execCommand (command, errorMsg) {
    if(command) {
      const Cmd = command.split(' ');
      const cmd = this.checkCommand(Cmd[0]);
      const ags = Cmd.slice(1);
      const res = await execAsync(cmd, ags, {
        stdio: 'inherit',
        cwd: process.cwd()
      })
      if(res !== 0) {
        throw new Error(errorMsg);
      }
    }
  }

  async ejsRender (options) {
    const dir = process.cwd();
    const projectInfo = this.projectInfo;
    return new Promise((resolve, reject) => {
      glob("**", {
        cwd: dir,
        ignore: options.ignore,
        nodir: true
      },(err, files) => {
        if(err) {reject(err)}
        Promise.all(files.map(file => {
          const filePath = path.join(dir, file);
          return new Promise((res, rej)=>{
            ejs.renderFile(filePath, projectInfo, {}, (err, result) => {
              if(err) {
                rej(err);
              } else {
                fse.writeFileSync(filePath, result)
                res(result);
              }
            })
          })
        })).then(()=>{
          resolve();
        }).catch((err)=>{
          reject(err);
        })
      })
    })
  }

  // 安装标准模板
  async installNormalTemplate () {
    npmlog.verbose('正在安装标准模板');
    const Spinner = spinner('正在安装模板...');
    await sleep();
    try {
      const templatePath = path.resolve(this.templateNpm.cacheFilePath, 'template');
      const targetPath = path.resolve(process.cwd());
      fse.ensureDirSync(templatePath);
      fse.ensureDirSync(targetPath);
      fse.copySync(templatePath, targetPath);
    } catch (e) {
      throw e
    } finally {
      Spinner.stop(true);
      npmlog.success('模板安装成功');
    }
    const templateIgnore = this.templateInfo.ignore || [];
    const ignore = ['**/node_modules/**', ...templateIgnore];
    await this.ejsRender({ignore});
    const { installCommand, startCommand } = this.templateInfo;
    // 安装依赖
    await this.execCommand(installCommand, '依赖安装失败');
    // 执行启动命令
    await this.execCommand(startCommand, '启动失败');
  }
  // 安装自定义模板
  async installCustomTemplate () {
    npmlog.verbose('正在执行自定义模板');
    if(await this.templateNpm.exists()) {
      const rootFile = await this.templateNpm.getRootFilePath();
      if(fs.existsSync(rootFile)) {
        const templatePath = path.resolve(this.templateNpm.cacheFilePath, 'template');
        const options = {
          ...this.templateInfo,
          ...this.projectInfo,
          sourcePath: templatePath,
          targetPath: process.cwd(),
        };
        console.log(options)
        const code = `require('${rootFile}')(${JSON.stringify(options)})`;
        await execAsync('node', ['-e', code], {stdio: 'inherit', cwd: process.cwd()});
        npmlog.success('自定义模板安装成功');
      } else {
        throw new Error('自定义模板入口不存在');
      }
    }
  }
  // 下载模板
  async downLoadTemplate () {
    const { projectTemplate } = this.projectInfo;
    const templateInfo = this.template.find(item => {
      return item.npmName === projectTemplate
    })
    const targetPath = path.resolve(userHome,'.sesame-cli','template');
    const storeDir = path.resolve(userHome,'.sesame-cli','template','node_modules');
    this.templateInfo = templateInfo;
    const templateNpm = new Package({
      targetPath,
      storeDir,
      packageName: templateInfo.npmName,
      packageVersion: templateInfo.version,
    })
    if(!await templateNpm.exists()) {
      const Spinner = spinner('正在下载模板');
      await sleep();
      try {
        await templateNpm.install();
      } catch (e) {
        throw e
      } finally {
        Spinner.stop(true);
        if (await templateNpm.exists()) {
          npmlog.success('下载模板成功');
          this.templateNpm = templateNpm;
        }
      }
    } else {
      const Spinner = spinner('正在更新模板');
      await sleep();
      try {
        await templateNpm.update()
      } catch (e) {
        throw e;
      } finally {
        Spinner.stop(true);
        if(await templateNpm.exists()) {
          npmlog.success('更新模板成功');
          this.templateNpm = templateNpm;
        }
      }
    }
  }
  // 安装前的准备工作
  async prepare () {
    const localPath = process.cwd();
    const template = await getProjectTemplate();
    if(!template || template.length <=0) {
      throw new Error("项目模板不存在");
    }
    this.template = template;
    // 当前目录不为空
    if(!this.ifDirIsEmpty(localPath)) {
      let ifContinue = false
      if(!this.force) {
        ifContinue = (await inquirer.prompt({
          type:'confirm',
          name:'ifContinue',
          message: '当前文件夹不为空是否继续创建项目',
          default: false
        })).ifContinue;
        if(!ifContinue) return;
      }
      // 强制清空当前目录
      if(ifContinue || this.force) {
        const { confirmDelete } = await inquirer.prompt({
          type:'confirm',
          name:'confirmDelete',
          message: '是否确认清空当前文件夹？',
          default: false
        })
        if(!confirmDelete) return;
        if(confirmDelete) {
          fse.emptydirSync(localPath);
        }
      }
    }
    return await this.getProjectInfo();
  }
  // 判断目录是否为空
  ifDirIsEmpty (localPath) {
    let fileList = fs.readdirSync(localPath);
    fileList = fileList.filter(file => (
      !file.startsWith('.') && ['node_modules'].indexOf('file') < 0
    ));
    return !fileList || fileList.length<=0
  }
  // 获取项目信息
  async getProjectInfo () {
    function isValidName(v) {
      return /^[a-zA-Z]+([-][a-zA-Z]+[a-zA-Z0-9]*|[_][a-zA-Z]+[a-zA-Z0-9]*|[a-zA-Z0-9])*$/.test(v)
    }
    let projectInfo = {}
    let isProjectNameVilde = false;
    if(this.projectName && isValidName(this.projectName)) {
      isProjectNameVilde = true;
      projectInfo.projectName = this.projectName;
    }
    const {type}  =  await inquirer.prompt({
      name: 'type',
      type:'list',
      message: '请选择初始化类型',
      choices:[
        {
          value:TYPE_PROJECT,
          name: '创建项目'
        },
        {
          value: TYPE_COMPONENT,
          name: '创建组件'
        }
      ],
      default: TYPE_PROJECT
    })
    // 筛选组件或项目模板
    this.template = this.template.filter(template => template.tag.includes(type));
    const typeTitle = type === TYPE_PROJECT ? '项目' : '组件'
    const projectNamePrompt = {
      type: 'input',
      name:'projectName',
      message: `请输入${typeTitle}名`,
      default:'',
      validate: function (v) {
        // 首字符必须为英文
        // 尾字符必须为英文或者数字
        // 字符仅允许"-_"
        const done = this.async();
        setTimeout(function () {
          if(!isValidName(v)) {
            done(`请输入合法的${typeTitle}名称`);
          }
          done(null, true);
        }, 0)
      },
      filter: function(v) {
        return v
      }
    };
    const projectPrompt = [];
    if(!isProjectNameVilde) {
      projectPrompt.push(projectNamePrompt)
    }
    projectPrompt.push(...[
      {
        type: 'input',
        name:'projectVersion',
        message: `请输入${typeTitle}版本号`,
        default:'1.0.0',
        validate: function (v) {
          const done = this.async();
          setTimeout(function () {
            if(!(!!semver.valid(v))) {
              done(`请输入合法的${typeTitle}版本号`);
            }
            done(null, true);
          }, 0)
        },
        filter: function(v) {
          if(!!semver.valid(v)) {
            return semver.valid(v)
          } else {
            return v
          }
        }
      },
      {
        type: 'list',
        name:"projectTemplate",
        message: `请选择${typeTitle}模板`,
        choices: this.createTemplateChoices(this.template)
      }
    ])

    if(type === TYPE_PROJECT){
      // 获取模板基本信息
      const project = await inquirer.prompt(projectPrompt)
      projectInfo = {
        ...projectInfo,
        type,
        ...project
      }
    }
    else if(type === TYPE_COMPONENT) {
      // 获取组件基本信息
      const descriptionPrompt = {
        type: 'input',
        name: 'componentDescription',
        message: '请输入描述信息',
        default: '',
        validate: function (v) {
          const done = this.async();
          setTimeout(function () {
            if(!v) {
              done('请输入组件描述信息');
              return;
            }
            done(null, true);
          }, 0)
        }
      }
      projectPrompt.push(descriptionPrompt)
      const project = await inquirer.prompt(projectPrompt)
      projectInfo = {
        ...projectInfo,
        type,
        ...project
      }
    }
    // 生成className
    if(projectInfo.projectName) {
      projectInfo.className = require("kebab-case")(projectInfo.projectName).replace(/^-/, '');
    }
    if(projectInfo.componentDescription) {
      projectInfo.description = projectInfo.componentDescription
    }
    return projectInfo
  }
  // 格式化模板信息
  createTemplateChoices(templateList) {
    return templateList.map(item => {
      return {
        value: item.npmName,
        name: item.name
      }
    })
  }
}

function init (argv) {
  return  new InitCommand(argv);
}

module.exports = init
module.exports.InitCommand = InitCommand;
