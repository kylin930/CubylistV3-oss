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
        const authHeader = context.request.headers.get("Authorization") || "";
        const expectedAdminToken = context.env.ADMIN_TOKEN || "secret-admin-token-cf-alist-v3";
        
        // 判定当前操作者是否为合法的管理员
        const isAdmin = (authHeader === expectedAdminToken || authHeader === `Bearer ${expectedAdminToken}`);

        // 解析前端传来的 POST 请求体
        const requestBody = await context.request.json();
        let { path } = requestBody;

        if (!path) {
            path = "/";
        }

        // 规范化路径结构，强制解码防乱码
        let decodedPath = decodeURIComponent(decodeURIComponent(path));
        if (!decodedPath.startsWith("/")) {
            decodedPath = "/" + decodedPath;
        }
        if (decodedPath.length > 1 && decodedPath.endsWith("/")) {
            decodedPath = decodedPath.slice(0, -1);
        }

        const kvNamespace = context.env.ALIST_KV;
        if (!kvNamespace) {
            throw new Error("ALIST_KV namespace is not bound.");
        }

        // 从 KV 获取对应目录下的虚拟目录树
        const kvKey = `dir:${decodedPath}`;
        const dirDataStr = await kvNamespace.get(kvKey);

        let content = [];
        if (dirDataStr) {
            content = JSON.parse(dirDataStr);
        }

        // 严格映射数据字段
        const formattedContent = content.map(item => {
            const itemPath = item.path || (decodedPath === "/" ? `/${item.name}` : `${decodedPath}/${item.name}`);
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
                type: item.type || (item.is_dir ? 1 : 0),
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
                "write": isAdmin, 
                "provider": "Cloudflare KV"
            }
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store" // 列表也禁缓存，防止多设备角色权限被节点误缓存缓存
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            code: 500,
            message: "List VFS Error: " + error.message,
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