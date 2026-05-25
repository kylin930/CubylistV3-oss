export async function onRequest(context) {
    const { request, env } = context;

    // 处理跨域预检请求 (CORS)
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization"
            }
        });
    }

    try {
        if (request.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405 });
        }

        // 解析 AList 前端传来的请求体
        // 示例: {"path": "/我的虚拟分类/动漫视频"}
        const requestBody = await context.request.json();
        let { path } = requestBody;

        if (!path) {
            return new Response(JSON.stringify({ code: 400, message: "Path is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 规范化路径结构
        if (!path.startsWith("/")) path = "/" + path;
        if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

        const kv = env.ALIST_KV;
        if (!kv) throw new Error("ALIST_KV namespace is not bound.");

        // 拆解出父级目录和当前想创建的文件夹名称
        const lastSlashIndex = path.lastIndexOf("/");
        const parentPath = lastSlashIndex === 0 ? "/" : path.substring(0, lastSlashIndex);
        const newFolderName = path.substring(lastSlashIndex + 1);

        const parentDirKey = `dir:${parentPath}`;
        const existingParentDataStr = await kv.get(parentDirKey);
        
        let parentContentList = [];
        if (existingParentDataStr) {
            parentContentList = JSON.parse(existingParentDataStr);
        }

        // 检查父级目录下是否已存在同名的文件或文件夹
        const isDuplicate = parentContentList.some(item => item.name === newFolderName);
        if (isDuplicate) {
            return new Response(JSON.stringify({
                code: 400,
                message: "文件夹或文件已存在",
                data: null
            }), {
                status: 200, // AList 业务异常通常也通过 200 携带业务 code 告知
                headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" }
            });
        }

        const nowIso = new Date().toISOString();

        // 构建虚拟文件夹的元数据节点
        const newFolderMeta = {
            id: "dir-" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36),
            name: newFolderName,
            size: 0,
            is_dir: true, // 核心：声明为虚拟目录
            modified: nowIso,
            created: nowIso,
            sign: "",
            thumb: "",
            type: 1 // AList 中 1 代表目录
        };

        // 1. 将新文件夹信息推入直接父级目录索引列表中
        parentContentList.push(newFolderMeta);
        await kv.put(parentDirKey, JSON.stringify(parentContentList));

        // 2. 初始化这个新文件夹自己的空目录树键值，防止 list.js 报错
        const selfDirKey = `dir:${path}`;
        const isSelfDirKeyExist = await kv.get(selfDirKey);
        if (!isSelfDirKeyExist) {
            await kv.put(selfDirKey, JSON.stringify([]));
        }

        // 返回标准 AList 成功响应体
        return new Response(JSON.stringify({
            code: 200,
            message: "success",
            data: null
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*"
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "Mkdir VFS Error: " + error.message, data: null }), {
            status: 500,
            headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" }
        });
    }
}