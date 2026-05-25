// 模拟 AList 底层工具函数：根据文件名后缀智能返回前端所需的渲染 type
function getAlistFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const typeMap = {
        // 2: 视频组件
        'mp4': 2, 'mkv': 2, 'avi': 2, 'flv': 2, 'mov': 2, 'webm': 2,
        // 3: 音频组件
        'mp3': 3, 'flac': 3, 'wav': 3, 'ogg': 3, 'm4a': 3,
        // 5: 图片组件 (极其关键)
        'jpg': 5, 'jpeg': 5, 'png': 5, 'gif': 5, 'webp': 5, 'bmp': 5, 'svg': 5, 'ico': 5,
        // 6: 文本/代码查看器
        'txt': 6, 'md': 6, 'json': 6, 'html': 6, 'js': 6, 'css': 6, 'py': 6, 'go': 6
    };
    return typeMap[ext] || 0; // 0 为通用未知下载文件
}

async function ensureVirtualParentDirectories(kv, decodedPath) {
    const segments = decodedPath.split('/').filter(p => p);
    if (segments.length <= 1) return;

    for (let i = segments.length - 1; i > 0; i--) {
        const parentSegments = segments.slice(0, i);
        const currentFolderName = segments[i - 1]; 

        const grandParentPath = parentSegments.length === 1 ? "/" : "/" + parentSegments.slice(0, -1).join("/");
        const grandParentKey = `dir:${grandParentPath}`;

        const grandParentDataStr = await kv.get(grandParentKey);
        let list = [];
        if (grandParentDataStr) list = JSON.parse(grandParentDataStr);

        const exists = list.some(item => item.name === currentFolderName && item.is_dir);
        if (!exists) {
            const nowIso = new Date().toISOString();
            list.push({
                id: "dir-" + Math.random().toString(36).substring(2, 10),
                name: currentFolderName,
                size: 0,
                is_dir: true,
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

        const rawJson = await request.json();
        let { path, name, size, oss_key } = rawJson;

        // 双重安全防线：在服务端也强制进行全量 URL 解码清洗
        let decodedPath = decodeURIComponent(decodeURIComponent(path));
        let decodedName = decodeURIComponent(decodeURIComponent(name));
        let decodedOssKey = decodeURIComponent(decodeURIComponent(oss_key));

        if (decodedName.includes("/")) {
            decodedName = decodedName.substring(decodedName.lastIndexOf("/") + 1);
        }

        if (!decodedPath.startsWith("/")) decodedPath = "/" + decodedPath;
        if (decodedPath.length > 1 && decodedPath.endsWith("/")) decodedPath = decodedPath.slice(0, -1);

        const kv = env.ALIST_KV;
        const nowIso = new Date().toISOString();

        // 🚀 核心修复：根据纯净的文件名自动计算对应的 alist 渲染 type 数字
        const alistType = getAlistFileType(decodedName);

        const newFileMeta = {
            id: "file-" + Date.now() + Math.random().toString(36).substring(2, 5),
            name: decodedName, 
            size: size || 0,
            is_dir: false,
            modified: nowIso,
            created: nowIso,
            type: alistType, // 写入精准的类型识别码（如图片写入5，视频写入2）
            oss_key: decodedOssKey 
        };

        // 写入独立文件键
        await kv.put(`file:${decodedPath}`, JSON.stringify(newFileMeta));

        // 追加到父目录索引
        const lastSlashIndex = decodedPath.lastIndexOf("/");
        const parentPath = lastSlashIndex === 0 ? "/" : decodedPath.substring(0, lastSlashIndex);
        const dirKey = `dir:${parentPath}`;

        const existingDirStr = await kv.get(dirKey);
        let dirContentList = [];
        if (existingDirStr) dirContentList = JSON.parse(existingDirStr);

        dirContentList = dirContentList.filter(item => item.name !== decodedName);
        dirContentList.push(newFileMeta);

        await kv.put(dirKey, JSON.stringify(dirContentList));
        await ensureVirtualParentDirectories(kv, decodedPath);

        return new Response(JSON.stringify({ code: 200, message: "Success" }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
}