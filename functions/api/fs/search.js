export async function onRequest(context) {
    // 1. 处理 CORS 预检请求
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
        if (context.request.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405 });
        }

        const requestBody = await context.request.json();
        // AList 的搜索请求体会携带：关键词、分页、以及可选的父目录范围
        let { keywords, parent = "/", page = 1, per_page = 50 } = requestBody;

        if (!keywords) {
            return new Response(JSON.stringify({ code: 400, message: "Keywords is required", data: null }), {
                status: 200, 
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        const db = context.env.ALIST_D1;
        if (!db) throw new Error("ALIST_D1 namespace is not bound.");

        const startIndex = (page - 1) * per_page;
        const likeKeyword = `%${keywords}%`;

        // 2. 动态构建 SQL 语句 (支持全局搜索与限定目录搜索)
        let countSql, dataSql, results;

        if (parent === "/") {
            // 全局搜索
            countSql = db.prepare("SELECT count(*) as total FROM vfs WHERE name LIKE ?").bind(likeKeyword);
            dataSql = db.prepare("SELECT * FROM vfs WHERE name LIKE ? ORDER BY is_dir DESC, modified DESC LIMIT ? OFFSET ?").bind(likeKeyword, per_page, startIndex);
        } else {
            // 限定在某个特定的虚拟目录下搜索 (例如只搜 /动漫 下的文件)
            let decodedParent = decodeURIComponent(decodeURIComponent(parent));
            if (!decodedParent.startsWith("/")) decodedParent = "/" + decodedParent;
            if (decodedParent.length > 1 && decodedParent.endsWith("/")) decodedParent = decodedParent.slice(0, -1);
            
            const likePath = `${decodedParent}/%`;

            countSql = db.prepare("SELECT count(*) as total FROM vfs WHERE name LIKE ? AND path LIKE ?").bind(likeKeyword, likePath);
            dataSql = db.prepare("SELECT * FROM vfs WHERE name LIKE ? AND path LIKE ? ORDER BY is_dir DESC, modified DESC LIMIT ? OFFSET ?").bind(likeKeyword, likePath, per_page, startIndex);
        }

        // 3. 执行 Batch 原子级查询，同时获取总条数和分页数据
        results = await db.batch([countSql, dataSql]);

        const totalItems = results[0].results[0].total || 0;
        const dbItems = results[1].results || [];

        // 4. 组装 AList 期待的数据结构
        const paginatedContent = dbItems.map(item => ({
            id: item.id,
            path: item.path,
            parent: item.parent_path,
            name: item.name,
            size: item.size,
            is_dir: !!item.is_dir,
            modified: item.modified,
            created: item.created,
            sign: item.sign || "",
            thumb: item.thumb || "",
            type: item.type,
            hashinfo: "null",
            hash_info: null,
            label_list: null
        }));

        const responseData = {
            "code": 200,
            "message": "success",
            "data": {
                "content": paginatedContent,
                "total": totalItems,
                "readme": "",
                "provider": "Cloudflare D1"
            }
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store" 
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "Search VFS Error: " + error.message, data: null }), {
            status: 500,
            headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" }
        });
    }
}