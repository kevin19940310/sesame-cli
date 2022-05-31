
function error (methName) {
    throw new Error(`${methName}方法必须实现!`);
}

class GitServer{
    constructor(type, token) {
        this.type = type;
        this.token = token;
    }
    // 设置git token
    setToken (token) {
        // error('setToken');
        this.token = token
    }
    // 设置git个人仓库
    createRepo() {
        error('createRepo');
    }
    // 获取git个人仓库
    getRepo() {
        error('getRepo');
    }
    // 设置git组织仓库
    createOrgRepo() {
        error('createOrgRepo');
    }

    getRemote() {
        error('getRemote');
    }
    // 获取git用户
    getUser() {
        error('getUser');
    }
    // 获取git组织
    getOrg() {
        error('getOrg');
    }
    // 获取SSHKey文档
    getSSHKeyUrl() {
        error('getSSHKeyUrl');
    }
    // 获取token生成帮助文档
    getTokenHelpUrl() {
        error('getTokenHelpUrl');
    };

    isHttpResponse (response) {
        return response && response.status;
    }

    handelResponse (response) {
        const code = this.isHttpResponse(response);
        if(code && (code ===200 || code ==='开始')) {
            return response
        } else {
            return null;
        }
    }

}
module.exports = GitServer;