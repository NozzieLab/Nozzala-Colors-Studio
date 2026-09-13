# Nozzala Colors · GitHub Pages

这是可直接发布的静态灯语工作室，无需后台或构建依赖。

1. 把本目录的文件上传到 GitHub 仓库 main 分支根目录，直接包含 index.html。
2. Settings → Pages → Source 选择 Deploy from a branch。
3. Branch 选择 main，Folder 选择 /(root)，点击 Save。
4. 等发布完成，在电脑 Chrome/Edge 中打开 HTTPS 地址，点击连接设备。

不要把 ZIP 文件本身当作网页上传，也不要多套一层目录。
如需从 /docs 发布，把所有文件放入 /docs 并选择该目录。

使用说明：打开 help.html。设备需要对应 PCB 的 v1.3.0 固件。
部署不需要重新刷固件，首次访问新网站需要重新授权 USB 设备。
网站无需 Python、Node、API密钥或服务器地址。配置通过 WebHID 直接发送给本地设备。
本包仅包含网页，不包含工程硬件文件、固件或本机路径。
