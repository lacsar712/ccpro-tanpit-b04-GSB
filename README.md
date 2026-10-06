# TanPit-01 · 南冈鞣场

鞣坑场地图作业台。登录后是按行列铺开的坑位，点坑登记浸液酸碱度并改状态。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Web API | Django 5 · Django Ninja（不是 DRF 视图集） |
| 结构 | Django app `pits`：models / rules / api 分文件 |
| 数据 | Django ORM · PostgreSQL 15 |
| 前端 | Lit 3 Web Component · Vite |
| 部署 | Docker Compose |

## 路径与端口

- 前端：http://localhost:4770
- API：http://localhost:8770
- PostgreSQL：localhost:6170

## 演示账号

`admin` / `123456`，`worker` / `123456`

## 业务规则

坑不可标「已放液」，除非最近一次浸液酸碱度在 **3.5～5.0**。规则在 `backend/pits/rules.py`。

坑笔记（顶栏「坑笔记」专页或场地图抽屉里都能写）规矩：

- 汉字 **10～48** 个，空白按缺字打回；
- 正文须出现 **青皮村**；
- 正文须含 **两位连续数字** 作鞣次（如 `07`）。

缺村名、缺鞣次或缺字一律打回，先校验后落库。改坑态、登记酸碱度不读笔记规矩。

## 快速启动

```bash
cd TanPit/TanPit-01
docker compose up --build
```
