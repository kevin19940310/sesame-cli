'use strict';
const Axios = require('axios');
const urlJoin = require('url-join');
const semver = require('semver');


function getDefaultRegistry (isOriginal = true) {
    return isOriginal ? 'https://registry.npmjs.org' : 'https://registry.npm.taobao.org/'
}

// 获取模块信息
function getNpmInfo (npmName, registry) {
    if(!npmName) return null;
    const registryUrl = registry ? registry : getDefaultRegistry();
    const npmInfoUrl = urlJoin(registryUrl, npmName);
    return  Axios.get(npmInfoUrl).then(response => {
        if(response.status === 200) {
            return response.data;
        }
        return null;
    }).catch(err => {
        return Promise.reject(err);
    })
}

// 获取模块历史版本列表
async function getNpmVersions (npmName, registry) {
    const data = await getNpmInfo(npmName, registry);
    if(data) {
        return Object.keys(data.versions);
    } else {
        return [];
    }
}

// 获取比当前版本高的版本号列表
function getSemverVersions (baseVersion, versions) {
    return versions
        .filter(version => semver.satisfies(version, `>${baseVersion}`))
        .sort((a, b) => semver.gt(b, a) ? 1 : -1);

}

// 获取最新的版本号
async function getNpmSemverVersion(npmName, baseVersion, registry) {
    const versions = await getNpmVersions(npmName, registry);
    const newVersions = getSemverVersions(baseVersion, versions);
    if(newVersions && newVersions.length > 0) {
        return newVersions[0];
    }
    return null;
}

async function getNpmLatestVersion(npmName, registry) {
    let versions = await getNpmVersions(npmName, registry);
    if(versions) {
        versions =  versions.sort((a, b) => semver.gt(b, a) ? 1 : -1);
        return versions[0];
    }
    return null
}

module.exports = {
    getNpmInfo,
    getNpmVersions,
    getNpmSemverVersion,
    getDefaultRegistry,
    getNpmLatestVersion
};
