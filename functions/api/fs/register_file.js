// 辅助函数：当上传至深层目录时，递归确保上级虚拟文件夹在 KV 中也有对应的索引，防止 AList 加载不到父目录报错
async function ensureVirtualParentDirectories(kv, path) {
    const segments = path.split('/').filter(p => p);
    // 如果是第一级根目录下的文件，直接跳过
    if (segments.length <= 1) return;

    // 从深往浅，反向推导每一级父目录。例如对于 "/A/B/C/file.mp4"：
    // 我们需要确保 dir:/A 包含虚拟目录 B；dir:/A/B 包含虚拟目录 C
    for (let i = segments.length - 1; i > 0; i--) {
        const parentSegments = segments.slice(0, i);
        const currentFolderName = segments[i - 1]; // 当前这一级被作为目录对待

        const lastSlashIndex = parentSegments.lastIndexOf;
        const grandParentPath = parentSegments.length === 1 ? "/" : "/" + parentSegments.slice(0, -1).join("/");
        const grandParentKey = `dir:${grandParentPath}`;

        const grandParentDataStr = await kv.get(grandParentKey);
        let list = [];
        if (grandParentDataStr) {
            list = JSON.parse(grandParentDataStr);
        }

        // 检查这个文件夹的名字是否已经被父级记录了
        const exists = list.some(item => item.name === currentFolderName && item.is_dir);
        if (!exists) {
            const nowIso = new Date().toISOString();
            list.push({
                id: "dir-" + Math.random().toString(36).substring(2),
                name: currentFolderName,
                size: 0,
                is_dir: true, // 标记为虚拟文件夹
                modified: nowIso,
                created: nowIso,
                type: 1
            });
            await kv.put(grandParentKey, JSON.stringify(list));
        }
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
                "Access-Control-Allow-Headers": "Content-Type"
            }
        });
    }

    try {
        if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

        const { path, name, size, oss_key } = await request.json();
        if (!path || !name) {
            return new Response(JSON.stringify({ code: 400, message: "Missing required fields" }), { status: 400 });
        }

        const kv = env.ALIST_KV;
        const nowIso = new Date().toISOString();

        // 1. 构建该文件的元数据对象
        const newFileMeta = {
            id: "file-" + Date.now(),
            name: name,
            size: size || 0,
            is_dir: false,
            modified: nowIso,
            created: nowIso,
            type: 0, 
            oss_key: oss_key // 它会被精准设置为无斜杠的根目录文件名 "xxx_1716_uuid.jpg"
        };

        // 2. 写入独立的虚拟文件元数据键
        await kv.put(`file:${path}`, JSON.stringify(newFileMeta));

        // 3. 计算它的直接父虚拟路径
        const lastSlashIndex = path.lastIndexOf("/");
        const parentPath = lastSlashIndex === 0 ? "/" : path.substring(0, lastSlashIndex);
        const dirKey = `dir:${parentPath}`;

        const existingDirStr = await kv.get(dirKey);
        let dirContentList = [];
        if (existingDirStr) {
            dirContentList = JSON.parse(existingDirStr);
        }

        // 覆盖去重
        dirContentList = dirContentList.filter(item => item.name !== name);
        dirContentList.push(newFileMeta);

        // 4. 更新直接父目录的 KV 索引
        await kv.put(dirKey, JSON.stringify(dirContentList));

        // 5. 🚀 核心增加：递归处理更高层级的文件夹骨架
        await ensureVirtualParentDirectories(kv, path);

        return new Response(JSON.stringify({ code: 200, message: "Registered in VFS flattening successfully" }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "VFS Flattener error: " + error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
}