# 发布插件

```bash
// 安装vsce
npm install -g @vscode/vsce
// 登录
vsce login Workgaga
// 根据提示输入token
// token在这里：https://dev.azure.com/workgaga/_usersSettings/tokens
cd ./vscodePlugin
修改package.json里的version：`"version": "0.0.14",`
// 执行发布命令
vsce publish
```
