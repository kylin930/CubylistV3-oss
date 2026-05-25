export async function onRequest(context) {
    // 处理跨域预检请求 (CORS)
    if (context.request.method === "OPTIONS") {
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
        // 解析前端传来的 POST 请求体
        const requestBody = await context.request.json();
        let { path } = requestBody;

        if (!path) {
            path = "/";
        }

        // 规范化路径：确保以 / 开头，且非根目录去除末尾的 /
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        if (path.length > 1 && path.endsWith("/")) {
            path = path.slice(0, -1);
        }

        // 检查 Cloudflare KV 命名空间绑定状态
        const kvNamespace = context.env.ALIST_KV;
        if (!kvNamespace) {
            return new Response(JSON.stringify({
                code: 500,
                message: "Cloudflare KV binding 'ALIST_KV' is missing in environment.",
                data: null
            }), {
                status: 500,
                headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 从 KV 获取对应目录下的文件列表
        const kvKey = `dir:${path}`;
        const dirDataStr = await kvNamespace.get(kvKey);

        let content = [];
        if (dirDataStr) {
            content = JSON.parse(dirDataStr);
        }

        // 严格映射数据字段，100% 适配 AList 前端渲染诉求
        const formattedContent = content.map(item => {
            // 计算单项的完整虚拟路径
            const itemPath = item.path || (path === "/" ? `/${item.name}` : `${path}/${item.name}`);
            return {
                id: item.id || "",
                path: itemPath,
                name: item.name,
                size: item.size || 0,
                is_dir: !!item.is_dir,
                modified: item.modified || new Date().toISOString(),
                created: item.created || item.modified || new Date().toISOString(),
                sign: item.sign || "",
                thumb: item.thumb || "",
                type: item.type || (item.is_dir ? 1 : 0), // 1 为文件夹，其他根据文件类型映射
                hashinfo: "null",
                hash_info: null,
                label_list: null
            };
        });

        // 组装最终响应体
        const responseData = {
            "code": 200,
            "message": "success",
            "data": {
                "content": formattedContent,
                "total": formattedContent.length,
                "readme": "",
                "write": true, // 允许网页端触发上传/创建管理逻辑
                "provider": "Cloudflare KV"
            }
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*"
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            code: 500,
            message: "Internal Server Error: " + error.message,
            data: null
        }), {
            status: 500,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }
}