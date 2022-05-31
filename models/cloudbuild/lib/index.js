'use strict';
const io = require('socket.io-client');
const npmLog = require('@sesame-cli/log');
const get = require('loadsh/get');
const Request = require('@sesame-cli/request');
const inquirer = require('inquirer');

// const TIME_OUT = 5 * 60 * 1000;
const WS_SERVER = 'http://localhost:7001';
const CONNECT_TIME_OUT = 5 * 1000;

function parseMsg(msg) {
  const action = get(msg, 'data.action');
  const message = get(msg, 'data.payload.message');
  return {
    action,
    message
  }
}

class CloudBuild {
  constructor(git, options) {
    this.git = git;
    this.buildCmd = options.buildCmd;  // 构建命令
    this.type = options.type; // 静态资源服务器类型
    this.prod = options.prod; // 是否发布为正式版本
  }

  async init () {
    return new Promise((resolve, reject) => {
      const socket = io(WS_SERVER, {
        query: {
          repo: this.git.remote,
          name: this.git.name,
          branch: this.git.branch,
          buildCmd: this.buildCmd,
          version: this.git.version,
          type: this.type,
          prod: this.prod,
        }
      });
      socket.on('connect', () => {
        const { id } = socket;
        if(this.timer) {
          clearTimeout(this.timer);
        }
        socket.on(id, (data) => {
          const {action, message} = parseMsg(data);
          npmLog.success(action, message);
        })
        resolve();
      });

      const disconnect = () => {
        clearTimeout(this.timer);
        socket.disconnect();
        socket.close();
      };

      this.doTimeOut(() => {
        npmLog.error('云构建服务链接超时，自动终止');
        disconnect();
      }, CONNECT_TIME_OUT);

      socket.on('disconnect', () => {
        npmLog.info('云构建任务断开');
        disconnect();
      });

      socket.on('error', (err) => {
        npmLog.error('云构建error', err.message);
        disconnect();
        reject(err);
      });

      this.socket = socket;
    })
  }

  build() {
    return new Promise((resolve, reject) => {
      this.socket.emit('build');
      this.socket.on('build', msg => {
        const { action, message } = parseMsg(msg);
        npmLog.success(action, message);
      })
      this.socket.on('building', msg => {
        console.log(msg);
      })

      const disconnect = () => {
        clearTimeout(this.timer);
        this.socket.disconnect();
        this.socket.close();
      };

      this.socket.on('buildError', msg => {
        const { action, message } = parseMsg(msg);
        npmLog.error(action, message);
        disconnect();
        resolve(false);
      })

      this.socket.on('buildSuccess', msg => {
        const { action, message } = parseMsg(msg);
        npmLog.success(action, message);
        disconnect();
        resolve(true);
      })
    })
  }

  async prepare() {
    // 判断是否是正式发布
    if(this.prod) {
      const projectName = this.git.name;
      const projectType = this.prod ? 'prod' : 'dev';

      // 1. 获取静态资源文件
      const cosProject = await Request({
        url: 'project/cos',
        params: {
          name: projectName,
          type: projectType
        }
      });

      // 2. 判断当前项目的静态资源文件是否存在
      if(cosProject.code === 0 && cosProject.data.length > 0) {

        // 3. 询问用户是否进行覆盖发布
        const cover = (await inquirer.prompt({
          type: 'list',
          message: `远程已存在${this.git.name}项目，是否覆盖发布`,
          name:'cover',
          choices:[
            {
              name: '放弃发布',
              value: false,
            },
            {
              name: '覆盖发布',
              value: true,
            },
          ],
          default: false,
        })).cover
        if(!cover) {
          throw new Error('终止发布流程');
        }
      }
    }
  }

  doTimeOut(fn, time) {
    this.timer && clearTimeout(this.timer);
    npmLog.info('设置任务超时时间', `${time / 1000}秒`);
    this.timer = setTimeout(fn, time);
  }

}
module.exports = CloudBuild;
