// console.log(global.timeStamp)
let fs = require('fs'); //文件模块
let path = require('path'); //文件模块
global.custom = {}
global.custom.config = require('../config/config')
let qiniu = require('qiniu')
let accessKey = global.custom.config.qiniu.accessKey
let secretKey = global.custom.config.qiniu.secretKey
let mac = new qiniu.auth.digest.Mac(accessKey, secretKey)
let config = new qiniu.conf.Config()
// 空间对应的机房
config.zone = qiniu.zone.Zone_z1
// 是否使用https域名
//config.useHttpsDomain = true;
// 上传是否使用cdn加速
//config.useCdnDomain = true;


// 获取时间戳
let getTimeStamp = async () => {
  let content = await getFileContent()
  return JSON.parse(content).timeStamp
}


// 获取文件内容
let getFileContent = () => {
  return new Promise((resolve, reject) => {
    // 读取json文件ª
    fs.readFile(path.resolve('config/timeStamp.json'), 'utf-8', function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}


// 获取文件和文件夹列表
let getList = async ({dir, cb}) => {
  let list = await fs.readdirSync(dir)
  await mapList({dir, cb, list})
}
// 遍历文件和文件夹列表
let mapList = async ({dir, cb, list}) => {
  list.map(async (data, index, all) => {
    let filePath = path.resolve(dir, data)
    let stat = fs.lstatSync(filePath)
    // 是文件夹 过滤文件夹
    if (stat.isDirectory()) {
      await getList({dir: filePath, cb})
    } else {
      //过滤非 .js 文件
      let rgx = "(.jpg|.js|.css|.png|.jpeg|.gif|.ico|.svg|.woff|.ttf|.eot)$"
      let re = new RegExp(rgx)
      if (re.test(filePath)) {
        cb(filePath)
      }
    }
  })
}
// 遍历文件目录
let eachFiles = async (dir, timeStamp) => {
  let arr = []
  await getList({
    dir, cb(filePath) {
      // 本地绝对路径
      let fileOriginPath = filePath
      //static.webascii.cn/admin-webascii/business/1537356292432/static/js/app.36f573b662ee99b96fb8.js
      // 相对路径
      // 例如：dmin-webascii/business/1537356292432/static/js/test.js
      let relativePath = `admin-webascii/business/${timeStamp}/${fileOriginPath.split('/dist/')[1]}`
      console.log(fileOriginPath)
      arr.push({fileOriginPath, relativePath})
    }
  })
  return arr
}

let CDN = ({data, index, cb, next}) => {
  // 如果索引大于data.length
  if (index >= data.length) {
    next()
    return
  }
  let localFile = data[index].fileOriginPath
  let formUploader = new qiniu.form_up.FormUploader(config)
  let putExtra = new qiniu.form_up.PutExtra()
// 开头不能为/
  let key = data[index].relativePath
  let options = {
    scope: `${global.custom.config.qiniu.scope}:${key}`
  }

  let putPolicy = new qiniu.rs.PutPolicy(options)
  let uploadToken = putPolicy.uploadToken(mac)
  // 文件上传
  formUploader.putFile(uploadToken, key, localFile, putExtra, (respErr, respBody, respInfo) => {
    if (respErr) {
      throw respErr
    }
    if (respInfo.statusCode == 200) {
      console.log(`[CDN Uploaded] ${respBody.key}`)
      cb({index: index + 1})
    } else {
      console.log(`[CDN Upload Error] statusCode:${respInfo.statusCode}`)
    }
  })
}
// 持续性上传
let continuityUpload = async (fileList) => {
  console.log(`[CDN Upload Start] 准备上传`)
  return new Promise((resolve, reject) => {
    let nextFn = () => {
      console.log(`[CDN Upload End] 上传成功 共${fileList.length}个文件上传成功`)
      resolve()
    }
    let callback = ({index}) => {
      CDN({data: fileList, index: index, cb: callback, next: nextFn})
    }
    CDN({data: fileList, index: 0, cb: callback, next: nextFn})
  })
}


let uploadCDN = async () => {
  let timeStamp = await getTimeStamp()
  let fileList = await eachFiles(path.resolve('dist'), timeStamp)
  await continuityUpload(fileList)
}

uploadCDN()



