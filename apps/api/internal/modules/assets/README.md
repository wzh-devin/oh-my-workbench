# 资产模块

入口依次为 Handler → Service → Repository。数据库迁移由应用启动时的 Goose 执行；所有查询和写事务位于 `repository*.go`。对象内容不可变，条目只保存位置和内容引用。

新对象Key为 `<管理前缀>/<用户ID>/<内容ID>/original.<扩展名>`，原始字节保持不变；完整校验后将识别出的Content-Type同步到S3对象。文件名和逻辑目录由Entry维护，重命名/移动只改目录记录，复制/秒传可复用内容。旧的 `blobs/<内容ID>` 及预览路径继续按数据库中的精确Key、版本读取，不迁移。ID不承担加密或鉴权；备份和恢复须同时保留数据库、对象内容与凭证密钥。

## 连接与运行

在资产页面填写已有 S3/MinIO 的 Endpoint、Bucket、Region、访问凭证和管理前缀即可，不需要资产专用环境变量，也不需要存储服务提供方增加任何配置。没有连接时显示“暂时没有配置存储”和配置入口。

工作台首次启动自动在 API 工作目录的 `.local/asset-credentials.key` 生成内部加密密钥，文件权限为 0600，后续启动复用。该目录已被 Git 忽略；部署时持久保存并随数据库备份，多实例共享同一份密钥文件。不要删除或重建已有密钥，否则原有凭证无法解密。

Endpoint 直接来自连接表单。对象请求固定到原始 origin；拨号前校验 DNS 并连接已核对的 IP，拒绝云元数据、链路本地、共享地址和保留地址。内网 MinIO 使用明确的 IP、localhost、本地服务名或 `.local`/`.internal`/`.lan` 域名；公开域名不能解析到本机或内网。

存储账号需具备专用前缀中的读、写、删除、列举对象版本、创建/列举/终止 Multipart Upload 及列举分片权限。工作台不自动创建 Bucket。已有内容时不能修改对象定位信息，禁用连接不删除内容。

Office预览与缩略图使用项目自带的私有转换服务，固定接入本机 `http://127.0.0.1:13039`。在 `apps/api/deploy/gotenberg/` 运行 `docker compose up -d --build` 即可，不需要设置转换地址或存储提供方配置。Gotenberg负责Office→PDF，独立渲染容器用libvips负责图片/PDF/纯文本摘要，FFmpeg负责视频截帧，并复用Gotenberg镜像中的Noto CJK字体。转换器禁止外网访问，入口仅绑定回环地址；libvips容器只读、临时目录有界，限制512MiB内存、1CPU、2个并发。服务不可用时原件仍可上传下载，已有缓存仍可读取，待生成任务保留。配置依据见 [Gotenberg配置](https://gotenberg.dev/docs/configuration) 与 [libvips缩略图](https://www.libvips.org/API/current/ctor.Image.thumbnail.html)。

## 缩略图

- 上传完成并通过完整SHA-256校验后，发布条目与创建缩略图记录同事务提交。缩略图不延长上传进度、不进入前端传输队列。
- 支持JPEG、PNG、WebP、GIF首帧、PDF首页，以及doc/docx/xls/xlsx/ppt/pptx/odt/ods/odp经PDF渲染的首页。图片原件最大32MiB、50MP；PDF/Office原件最大50MiB，Office生成的PDF最大100MiB。MOV/MP4/WebM/AVI视频最大100MiB并截取早期一帧；CSV/TSV及TXT/JSON/TOML/HTML等文本最多读取512KiB前缀生成摘要，HTML仅按转义源码绘制。其他或超限文件保持类型图标，仍可正常存取。
- 固定规格为512px包围框、只缩小、保持比例、按EXIF纠正方向、保留透明度、WebP输出（最多2MiB）。原件同组中保存 `preview-v1.pdf` 和 `thumbnail-512-v1.webp`，不在Bucket创建逻辑目录副本。
- 旧文件补齐时按已验证的类型修复原件Content-Type，保留原Key及已经开始下载可能使用的旧对象版本；不搬迁内容。新上传完成元数据校验并发布后，会清理未发布的临时版本，避免正常上传留下重复历史版本。
- 复用 `omw_asset_preview`，`renderer_version` 区分 `gotenberg-pdf-v1` 和 `thumbnail-512-v1`，无新增表/字段。Office预览PDF只生成一次，缩略图等待并复用它。状态为queued/rendering/ready/failed，沿用租约、最多3次文件错误重试和进程重启恢复。渲染服务离线或繁忙不消耗文件重试；显式重试会同时恢复失败的Office PDF。
- 当前页以一次批量索引查询读取缩略图，并优先补齐缺失记录。后台每5秒按条目主键游标补齐20项，不扫描Bucket。最后一个引用（包括回收站）彻底删除后统一清理原件及派生文件；清理等待在途渲染结束，迟到结果不得重新发布。
- 对象写入结果不确定时，保留原3分钟租约作为清理屏障；重试或彻底删除时同时清理对应Key未完成的Multipart Upload，避免转换产物遗留分片。
- 前端只对存在queued/rendering记录的当前页每5秒刷新一次；页面隐藏暂停，后台请求失败保留列表。图片懒加载，固定图像区域避免加载时改变布局；读取失败回退图标，生成失败可在文件菜单重试。

回滚到尚未识别缩略图规格的旧程序时，先停止当前API，等待渲染请求结束，再将缩略图待处理状态改为failed，保留Key用于后续清理；旧程序的预览Worker会忽略failed记录。不得直接删除缓存记录造成对象失去清理定位。重新升级后可通过文件菜单重试。

```sql
UPDATE omw_asset_preview
SET status='failed', lease_token='', lease_until=NULL,
    last_error='版本回滚后等待重试', updated_at=now()
WHERE renderer_version='thumbnail-512-v1'
  AND status IN ('queued','rendering');
```

## 状态与恢复

`omw_asset_operation` 是批量请求的防重和结果记录，共9列；元数据变更与记录在同一事务提交。它只保留用户、存储、操作类型、请求键、请求内容与结果，不承担任务调度。上传/分片、预览和对象清理各自保留正在使用的状态与租约。已有库由 `20261101000000_simplify_asset_operation.sql` 增量精简，历史防重记录与文件均保留；回滚到旧程序前先执行对应Down迁移。

- 小于 32 MiB 的文件经单次流式上传；大文件使用 8 MiB 原生分片。空文件有独立的零字节单片。
- 浏览器最多两个文件、每文件三个分片。Worker 分块计算完整 SHA-256；IndexedDB 只保存任务定位。
- 上传和分片各自持有数据库租约，网络请求不持有事务。完成响应丢失后先核对实际对象，服务端重新读取内容验证完整哈希后才发布条目。
- 暂停保留分片；取消和七天过期进入清理状态。后台循环恢复初始化、完成、校验、预览和清理。
- `cleaning` 对象禁止新引用；仅在包括回收站在内的最后一个条目解除引用后清理。已知版本用于读取，清理同时核对该稳定 Key 的所有版本和删除标记。
- 视图使用通用 `schemaVersion=1` AST；用户隔离和回收站条件始终额外附加。规则递归转换为白名单字段与参数化 SQL。

## 兼容与 API

ID 在 JSON 中为字符串。修改条目和视图携带 `version`；409 时保留草稿并重载版本。同目录名称不覆盖。批量操作和上传初始化携带 `requestKey`，重试沿用原标识。

`GET /overview` 返回总量、容量、分类、按天活动、连接统计、目录和近期文件；`POST /entries/query` 返回当前页与相同条件的总数。`GET /entries/:id/content` 每个请求重新鉴权，支持单 Range 的 206/416。下载使用浏览器流式保存。

列表条目可包含 `thumbnail: {status, version?}`，ready时version标识可缓存产物。`GET/HEAD /entries/:id/thumbnail?v=<version>`读取WebP，仍检查用户、连接启用状态及回收站可见性，权限检查后才处理ETag/304，响应为 `Cache-Control: private, no-cache`。`POST /entries/:id/thumbnail`显式重试失败记录；客户端不传Blob ID、对象Key、规格或远程URL。

旧浏览器数据由用户在“导入”中选择来源和目标。原件保留，`legacyId` 映射在服务端去重；全部内容上传后按批次恢复原元数据。重试不会覆盖之后的远端编辑。旧文件/目录链接通过详情入口解析为新 ID。


## 连续浏览与阅读预览

`POST /entries/query`传`cursorMode:true`、`pageSize:50`，首批不传cursor，后续携带响应`nextCursor`；`hasMore:false`表示结束。游标保存folder优先级、所选排序值和最后ID，绑定用户及完整查询条件，所有值仍作SQL参数且每次重新鉴权。锚点删除不影响继续读取；筛选/目录/排序/身份改变须丢弃旧游标。新模式不执行OFFSET和逐批COUNT，total仅保留为旧契约字段；page/pageSize模式继续兼容已有调用。

Web列表/网格连续追加、去重，使用现有TanStack Virtual只渲染可见行/卡片；错误保留已加载数据并原位重试。所有已加载元数据保留，切换查询额外保留最近600项，避免早期条目无法操作。仍遵守服务端每批最多200项操作，超过时全选入口明确为选择前200项，不擅自放大数据库事务。

图片/PDF共用紧凑工具栏，缩放相对原尺寸，支持适应窗口、1:1及预设比例。PDF默认按可用宽度缩小且不超过原尺寸，居中并保留文本层；比例菜单还可适应宽度，正文大于窗口时在阅读区滚动。CSV使用第一行表头、完整长字段换行、内部横向滚动和可变行高虚拟化，不嵌套业务分页；最多显示读取前缀中的10000行、100列，达到限制明确提示。压缩包在共享文件图标入口使用压缩文件字形。
