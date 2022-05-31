const GitServer = require("./gitServer");
const GithubRequest = require("./githubRequest");


class GitHub extends GitServer {
    constructor() {
        super('github');
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
                if(!response.status) {
                    return response
                }
                return null
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
        this.request = new GithubRequest(token);
    }
    // 获取SSHKey文档
    getSSHKeyUrl() {
        return 'https://docs.github.com/cn/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account'
    }
    // 获取token生成帮助文档
    getTokenHelpUrl() {
        return 'https://github.com/settings/tokens'
    };

    getRemote(login, name) {
        return `git@github.com:${login}/${name}.git`
    }
}
module.exports = GitHub