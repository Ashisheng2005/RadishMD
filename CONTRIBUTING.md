# 贡献指南

这份指南用于统一 RadishMD 的提交与协作方式，特别是 release note 自动化依赖的提交格式。

## 提交规范

推荐使用 Conventional Commits：

```text
type(scope): 简短说明
```

### 常用 type

- `feat`：新增功能
- `fix`：修复问题
- `perf`：性能优化
- `refactor`：重构，不改变功能
- `docs`：文档修改
- `test`：测试相关
- `build`：构建、依赖、打包
- `ci`：CI/CD 配置
- `chore`：杂项、工具、脚本

### 推荐示例

```bash
feat(editor): add async markdown preview
fix(save): prevent duplicate external change toast
perf(search): move file search to worker
docs(release): add release note automation guide
chore(build): update tauri release workflow
```

### 写法建议

- 一次提交只做一类事情
- 标题尽量简短，直接描述结果
- 有范围时加 `scope`，例如 `feat(editor): ...`
- 需要解释原因时，在空行后补充正文

### 带正文的示例

```bash
fix(save): prevent duplicate external change toast

保存后 watcher 会误判为外部修改，导致出现两个提示。
这次通过保存抑制窗口避免该问题。
```

### 命令速查

```bash
git commit -m "feat(editor): add async markdown preview"
git commit -m "fix(save): prevent duplicate external change toast"
git commit -m "perf(search): move file search to worker"
git commit -m "docs(release): add release note automation guide"
git commit -m "chore(build): update tauri release workflow"
```

如果需要补充说明，可以分两行写：

```bash
git commit -m "fix(save): prevent duplicate external change toast" -m "保存后 watcher 会误判为外部修改，导致出现两个提示。"
```

## 分支与发布

- 开发过程中尽量使用小而清晰的提交
- 发布时使用 `v*` tag
- GitHub Release 会自动从 tag 间的 commit 生成 release note

## 本地检查

提交前建议至少执行一次：

```bash
npm run build
```

如果涉及 Rust 代码，也建议检查：

```bash
cd src-tauri
cargo check --no-default-features
```
