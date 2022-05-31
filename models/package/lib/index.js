'use strict';

const { isObject } = require("@sesame-cli/utils");
const { getDefaultRegistry, getNpmLatestVersion } = require("@sesame-cli/get-npm-info");
const fse = require("fs-extra");
const npmInstall = require("npminstall");
const path = require("path");

class Package {
    constructor(options) {
        if(!options) {
            throw new Error("package类的options参数不能为空!");
        }
        if(!isObject(options)) {
            throw new Error("package类的options参数必须为对象!");
        }
        // package的路径
        this.targetPath = options.targetPath;
        // 缓存package的路径
        this.storeDir = options.storeDir;
        // package的name
        this.packageName = options.packageName;
        //package 的 version
        this.packageVersion = options.packageVersion;
        //package的缓存目录前缀
        this.cacheFilePathPrefix = this.packageName.replace('/','_');
    }
    // 安装或者更新前的准备工作
    async prepare () {
        // 缓存目录不存在则创建缓存目录文件夹
        if(!this.pathExistsSync(this.storeDir)) {
            fse.mkdirpSync(this.storeDir);
        }
        // 获取最新的version
        if (this.packageVersion === 'latest') {
            this.packageVersion = await getNpmLatestVersion(this.packageName);
        }
    }
    // 判断当前package是否存在
    async exists() {
        const  pathExists = await import('path-exists');
        this.pathExistsSync = pathExists.pathExistsSync;
        if(this.storeDir) {
            await this.prepare();
            return this.pathExistsSync(this.cacheFilePath);
        } else {
            return this.pathExistsSync(this.targetPath);
        }
    }
    //安装Package
    async install() {
        await this.prepare();
        await npmInstall({
            root:this.targetPath,
            storeDir: this.storeDir,
            registry: getDefaultRegistry(true),
            pkgs:[{
                name: this.packageName,
                version: this.packageVersion
            }]
        })
    }
    // 更新Package
    async update() {
        await this.prepare();
        const newVersion = await getNpmLatestVersion(this.packageName);
        const latestFilePath = this.getSpecificCacheFilePath(newVersion);
        if(!this.pathExistsSync(latestFilePath)) {
            await npmInstall({
                root:this.targetPath,
                storeDir: this.storeDir,
                registry:getDefaultRegistry(true),
                pkgs:[{
                    name: this.packageName,
                    version: newVersion
                }]
            })
            this.packageVersion = newVersion;
        } else {
            this.packageVersion = newVersion;
        }

    }
    // 获取入口文件路径
    async getRootFilePath() {
        async function _getRootFile(targetPath) {
            const pkgDir = await import('pkg-dir');
            const dir = await pkgDir.packageDirectory({cwd: targetPath})
            if(dir) {
                const pkgFile = require(path.resolve(dir, 'package.json'));
                if(pkgFile && pkgFile.main) {
                    // 路径兼容处理
                    return path.resolve(dir, pkgFile.main)
                }
            }
            return null;
        }
        if(!this.storeDir) {
            return await _getRootFile(this.targetPath)
        } else {
            return await _getRootFile(this.cacheFilePath)
        }

    }
    // 获取当前package的缓存路径
    get cacheFilePath() {
        return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${this.packageVersion}@${this.packageName}`)
    }
    // 获取指定版本的缓存路径
    getSpecificCacheFilePath(version) {
        return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${version}@${this.packageName}`)
    }
}
module.exports = Package;
