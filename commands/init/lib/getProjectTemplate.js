const request = require("@sesame-cli/request");

module.exports = function () {
  return request({
    url: "project/template"
  })
}
