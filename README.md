# 猜六星干员

看图猜《明日方舟》六星干员名字的小网页：出题人勾选若干干员，答题者把打乱的名字拖（或点）到图片上，提交后显示对错、正确率和用时。纯静态、无构建、无后端。

## 玩法

1. **出题**：在头像/半身图模式间切换，勾选任意数量六星干员（至少 2 人），支持搜索、职业筛选和随机 6/10/15/20 人。
2. **交接**：点击「开始游戏」后出现遮罩，把设备交给答题者，避免看到布局。
3. **答题**：名字在待选区被打乱。
   - 鼠标：直接把名字拖到图片下方的槽位，可拖回、可在槽位间交换；
   - 触屏：点一下名字（高亮）再点槽位，点已填槽位可取回。
   - 顶部正向上计时；「重置」清空摆放（计时继续）。
4. **结果**：全部填满后提交，显示 X/N、正确率、用时；错误项标红并给出正确名字。支持「同一批再玩一次」（朋友轮流玩）。

出题后 URL 形如 `index.html#m=avatar&ids=char_xxx,char_yyy,...`，把该链接发给朋友即可打开同一套题（会先出现交接遮罩）。

异格干员（如 斯卡蒂 / 浊心斯卡蒂、陈 / 假日威龙陈）在数据中互相独立，勾选与判定都不会混淆。

## 本地预览

```sh
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

不要直接双击 `index.html`：本地 `file://` 协议下浏览器会阻止读取 JSON 数据。

## 部署

整个目录推送到任意静态托管即可，无需构建命令：

- **GitHub Pages**：推送仓库后在 Settings → Pages 选择分支（已含 `.nojekyll`）。
- **Cloudflare Pages（直传）**：先组装只含站点文件的 `dist/`，再用 wrangler 部署
  （`wrangler.jsonc` 已配置 `pages_build_output_dir: dist`，项目已存在于账号下）：

  ```sh
  rm -rf dist && mkdir dist && cp index.html .nojekyll dist/ && cp -r css js dist/
  wrangler pages deploy
  ```

  线上地址：<https://operators-guess.pages.dev/>

  > 注意：如 wrangler 提示把项目委托给 Workers 且你想用经典 Pages，首次创建项目时需加 `--force`。

## 图片来源

仓库与部署包**不包含图片文件**，运行时直接热链 PRTS 的图片地址（与 PRTS 前端同一套逻辑）：

- 主源：`https://torappu.prts.wiki/assets/char_avatar|char_portrait/{charId}.png`
- 备源：主源加载失败时自动切换到 `https://media.prts.wiki/{md5}/头像_{名}.png`
  （半身像为 `半身像_{名}_1.png`）

需要离线备份图片时可运行 `python tools/fetch_data.py --download-images` 缓存到 `assets/`（该目录不入部署包）。

## 数据更新

出新六星后重跑即可刷新 `js/data/operators.json`（含干员元数据与主/备图片地址）：

```sh
python tools/fetch_data.py
```

数据来自 PRTS Cargo API（`chara` 表，`rarity=5 AND charIndex>0`），提交更新后的 JSON 再重新部署即可。

## 数据来源

- 干员数据与图片：[PRTS](https://prts.wiki/)（Cargo API / torappu、media 资源镜像）
- 相关素材版权归 **鹰角网络 / PRTS** 所有，本项目仅供玩家间娱乐交流。
