export async function onRequest(context) {
    // 1. 处理跨域预检请求
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

        // 解析 AList 传来的搜索参数
        const requestBody = await context.request.json();
        let { parent = "/", keywords = "", page = 1, per_page = 50, scope = 0 } = requestBody;

        // 规范化并双重解码父目录路径
        let decodedParent = decodeURIComponent(decodeURIComponent(parent));
        if (!decodedParent.startsWith("/")) decodedParent = "/" + decodedParent;
        if (decodedParent.length > 1 && decodedParent.endsWith("/")) decodedParent = decodedParent.slice(0, -1);

        const kv = context.env.ALIST_KV;
        if (!kv) throw new Error("ALIST_KV namespace is not bound.");

        // ==========================================
        // 利用 KV 前缀列表，找出所有符合路径的子文件夹键名
        // ==========================================
        // 如果 parent 是 "/"，prefix 就是 "dir:/"，能查出全站所有文件夹
        // 如果 parent 是 "/动漫"，prefix 就是 "dir:/动漫"
        const prefix = `dir:${decodedParent === '/' ? '/' : decodedParent}`;
        
        let allDirKeys = [];
        let listComplete = false;
        let cursor = "";

        // 循环拉取所有符合前缀的 keys (防止用户的文件夹数量超过单次 1000 条的限制)
        while (!listComplete) {
            const listOptions = { prefix: prefix };
            if (cursor) listOptions.cursor = cursor;
            
            const listResult = await kv.list(listOptions);
            allDirKeys.push(...listResult.keys);
            
            listComplete = listResult.list_complete;
            cursor = listResult.cursor;
        }

        // 严格过滤：防止 prefix="dir:/a" 错误匹配到 "dir:/abc"
        const validKeys = allDirKeys.filter(k => {
            const dirPath = k.name.substring(4); // 剥离 "dir:" 前缀
            return dirPath === decodedParent || dirPath.startsWith(decodedParent + "/");
        });

        // ==========================================
        // 并发拉取数据，并进行高并发内存级筛选
        // ==========================================
        let allMatches = [];
        const lowerKeyword = keywords.toLowerCase();
        
        // 采用分块并行策略 (批次大小50)，防止 V8 引擎并发请求过多导致超时
        const batchSize = 50;
        
        for (let i = 0; i < validKeys.length; i += batchSize) {
            const batch = validKeys.slice(i, i + batchSize);
            
            // 批量并发请求 KV
            const results = await Promise.all(batch.map(k => kv.get(k.name)));
            
            for (let j = 0; j < results.length; j++) {
                const dataStr = results[j];
                if (!dataStr) continue;
                
                // 当前正在遍历的父文件夹真实路径
                const currentParentPath = batch[j].name.substring(4); 
                const items = JSON.parse(dataStr);
                
                for (const item of items) {
                    // 1. 关键字模糊匹配 (忽略大小写)
                    if (keywords && !item.name.toLowerCase().includes(lowerKeyword)) {
                        continue;
                    }
                    
                    // 2. 搜素范围过滤 (scope: 0 全部, 1 仅文件夹, 2 仅文件)
                    if (scope === 1 && !item.is_dir) continue;
                    if (scope === 2 && item.is_dir) continue;

                    // 匹配成功，格式化为前端搜索所需的规范字段
                    allMatches.push({
                        parent: currentParentPath, // 明确指出它在哪个目录下
                        name: item.name,
                        is_dir: !!item.is_dir,
                        size: item.size || 0,
                        type: item.type || (item.is_dir ? 1 : 0),
                        id: item.id || "",
                        modified: item.modified || new Date().toISOString()
                    });
                }
            }
        }

        // 对汇总的搜索结果执行切片分页
        const totalItems = allMatches.length;
        const startIndex = (page - 1) * per_page;
        const endIndex = startIndex + per_page;
        const paginatedContent = allMatches.slice(startIndex, endIndex);

        const responseData = {
            "code": 200,
            "message": "success",
            "data": {
                "content": paginatedContent,
                "total": totalItems
            }
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store" // 严禁缓存搜索结果
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            code: 500,
            message: "Search VFS Error: " + error.message,
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