# harold-skills

Harold 的 Claude Code 插件集合；这里收的多是 idea-loop 这套从 issue 到合并的工作流里的概念。

## 术语

**业务**：
共用一份知识库（spec、ADR、设计档案、产品说明、issue 分类）的一组代码仓库；只有一个仓库的也是一个业务。
_Avoid_: 项目（已指 idea-loop 的目标项目，也是 Linear 的 Project）, 产品线, workspace（cmux、Linear 都已占用）

**业务根目录**：
一个业务的知识库所在的 git 仓库目录；业务里的代码仓库 clone 在它下面，会话从上层目录自动读到它的说明文件。
_Avoid_: workspace 根目录

**backlog**：
新进来、还没验证的 issue 所在的状态；调度不会把它派成会话。
_Avoid_: 待验证

**todo**：
验证过确实存在、等调度派成会话的 issue 所在的状态；进 todo 就是放行。
_Avoid_: 待完成

**子 issue**：
从一个父 issue 拆出来、能单独交一个 PR 的部分；版本和模块不用父子关系表达，分别用 milestone（或 Linear 的 Release）和分类 label（或 Linear 的 Project）。
_Avoid_: 整合, 根 issue 下的组

**工单**：
一个 PR 里的一个切片，写在 spec 目录下，一张一个 commit；几张工单一起 review、一起合并，不上 issue 平台。要单独 review、单独合并的一块是子 issue，不是工单。
_Avoid_: ticket 当成 issue 用, 子任务
