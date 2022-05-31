const Axios = require('axios');

const BASE_URL = 'https://api.github.com';
class GithubRequest {
    constructor(token) {
        this.token = token;
        this.service = Axios.create({
            baseURL: BASE_URL,
            timeout: 5000,
        })
        this.service.interceptors.request.use(config => {
            config.headers['Authorization'] = `token ${this.token}`;
            return config;
        },error => {
            if(error.response && error.response.data) {
                throw new Error(JSON.stringify(error.response.data))
            } else {
                throw new Error(error)
            }
        })
        this.service.interceptors.response.use(response => {
            return response.data;
        }, error => {
            if(error.response && error.response.data) {
                return error.response
            } else {
                return  Promise.reject(error);
            }
        })
    }
    get (url, params, headers) {
        return this.service({
            url,
            params: {
                ...params
            },
            method: 'get',
            headers,
        })
    }
    post (url, data, headers) {
        return this.service({
            url,
            data,
            method: 'post',
            headers,
        })
    }
}

module.exports = GithubRequest;