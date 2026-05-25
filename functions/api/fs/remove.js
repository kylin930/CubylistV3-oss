// 递归清空 KV 内部虚拟目录树架构的硬核辅助函数（斩草除根，防止僵尸元数据残留导致 KV 空间虚胖）
async function recursiveDeleteVFS(kv, targetPath) {
    // 1. 尝试删除该路径对应的独立文件键 file:{path} 
    await kv.delete(`file:${targetPath}`);

    // 2. 尝试读取并深挖该路径作为目录的索引列表
    const selfDirKey = `dir:${targetPath}`;
    const dirDataStr = await kv.get(selfDirKey);

    if (dirDataStr) {
        const items = JSON.parse(dirDataStr);
        // 遍历该目录下潜伏的所有子项目
        for (const item of items) {
            const childPath = targetPath === "/" ? `/${item.name}` : `${targetPath}/${item.name}`;
            if (item.is_dir) {
                // 如果子项目是文件夹，继续往下剥离递归
                await recursiveDeleteVFS(kv, childPath);
            } else {
                // 如果是标准文件，直接蒸发它的文件键
                await kv.delete(`file:${childPath}`);
            }
        }
        // 清理完该文件夹内部的所有细枝末节后，注销该文件夹自身的目录树键
        await kv.delete(selfDirKey);
    }
}

export async function onRequest(context) {
    const { request, env } = context;

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

        // 解析 AList 移除请求参数
        // 示例: {"dir": "/我的虚拟分类", "names": ["动漫视频", "不符合规则成员.csv"]}
        const requestBody = await context.request.json();
        let { dir, names } = requestBody;

        if (!dir || !names || !Array.isArray(names)) {
            return new Response(JSON.stringify({ code: 400, message: "Invalid delete parameters" }), {
                status: 400,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 规范化父目录路径结构
        if (!dir.startsWith("/")) dir = "/" + dir;
        if (dir.length > 1 && dir.endsWith("/")) dir = dir.slice(0, -1);

        const kv = env.ALIST_KV;
        if (!kv) throw new Error("ALIST_KV namespace is not bound.");

        const parentDirKey = `dir:${dir}`;
        const parentDataStr = await kv.get(parentDirKey);

        if (parentDataStr) {
            let parentContentList = JSON.parse(parentDataStr);

            // 1. 批量循环处理前端勾选的每一个待移除名称
            for (const name of names) {
                // 还原出这个待删除项目的完整虚拟网盘路径
                const targetFullPath = dir === "/" ? `/${name}` : `${dir}/${name}`;
                
                // 查找该节点属性（看它是文件还是虚拟文件夹）
                const matchedItem = parentContentList.find(item => item.name === name);
                
                if (matchedItem) {
                    if (matchedItem.is_dir) {
                        // 如果是虚拟目录，调用递归函数将其内部彻底洗净
                        await recursiveDeleteVFS(kv, targetFullPath);
                    } else {
                        // 如果是独立文件，直接把 file:{path} 对应的直链映射元数据擦除
                        await kv.delete(`file:${targetFullPath}`);
                    }
                }
            }

            // 2. 将这些名字从当前父目录列表中剔除过滤掉，刷新父目录的外观
            parentContentList = parentContentList.filter(item => !names.includes(item.name));
            
            // 将精简后的新父目录列表写回 KV 索引
            await kv.put(parentDirKey, JSON.stringify(parentContentList));
        }

        // 返回标准 AList 成功封包
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
        return new Response(JSON.stringify({ code: 500, message: "Remove VFS Error: " + error.message, data: null }), {
            status: 500,
            headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" }
        });
    }
}