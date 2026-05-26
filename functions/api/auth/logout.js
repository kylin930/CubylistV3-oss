export async function onRequest(context) {
    // 跨域预检处理
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

    const jsonResultString = '{"code":200,"message":"success","data":null}';

    return new Response(jsonResultString, {
        status: 200,
        headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store, no-cache, must-revalidate" // 防止浏览器把“注销成功”给缓存了
        }
    });
}