const GitServer = require("./gitServer");
const GiteeRequest = require('./giteeRequest');

class Gitee extends GitServer {
    constructor() {
        super('gitee');
        this.request = null;
    }
    getUser() {
        return this.request.get('/user');
    }
    getOrg() {
        return this.request.get('/user/orgs', {page: 1, per_page: 100});
    }

    // 获取git个人仓库
    getRepo(login, name) {
        return this.request.get(`/repos/${login}/${name}`)
            .then((response) => {
                return this.handelResponse(response);
            });
    }

    createRepo(name) {
        return this.request.post('/user/repos', {
            name,
        })
    }

    createOrgRepo(name, login) {
        return this.request.post(`/orgs/${login}/repos`, {
            name,
        })
    }

    setToken(token) {
        super.setToken(token);
        this.request = new GiteeRequest(token);
    }

    // 获取SSHKey文档
    getSSHKeyUrl() {
        return 'https://gitee.com/help/articles/4181'
    }
    // 获取token生成帮助文档
    getTokenHelpUrl() {
        return 'https://gitee.com/profile/personal_access_tokens';
    };

    getRemote(login, name) {
        return `git@gitee.com:${login}/${name}.git`
    }
}
module.exports = Gitee
