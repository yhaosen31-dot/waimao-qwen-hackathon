import { Badge } from "@/components/ui/badge";

export function CrossSearchConnectionPanel() {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">已关闭</Badge>
        <Badge variant="outline">disabled</Badge>
      </div>
      <div className="mt-3 font-medium">跨境搜旧线路已禁用。</div>
      <div className="mt-2 text-amber-800">
        账号出现风控后，当前系统不再测试连接、不再打开人工登录、不再访问一键搜。
        请使用 Excel 导入获客或产品搜索获客。
      </div>
    </div>
  );
}
