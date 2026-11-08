# 合成测试资料

`architecture.docx` 由 python-docx 创建，内容为“离线验收项目”、昆明经开区、教学楼 5 层、23.70 m、1234.56 ㎡，仅用于软件验收，不对应真实工程或用户原始资料。

表格只有一个正常表头和一行数据。回归通过真实 `readWordSource → fragments → composeDocument` 处理链验证单体表头与精确数值，不使用重复表头绕过解析问题。
