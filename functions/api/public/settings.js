export async function onRequest(context) {
    try {
        const responseData = {
            "code": 200,
            "message": "success",
            "data": {
                "allow_indexed": "true",
                "allow_mounted": "false",
                "allow_register": "false",
                "announcement": "",
                "audio_autoplay": "true",
                "audio_cover": "https://jsd.nn.ci/gh/alist-org/logo@main/logo.svg",
                "auto_update_index": "false",
                "default_page_size": "50",
                "default_role": "1",
                "device_evict_policy": "deny",
                "device_session_ttl": "86400",
                "external_previews": "{}",
                "favicon": "https://nnp.nekopara.us/neko.png",
                "filename_char_mapping": "{\"/\": \"|\"}",
                "filter_readme_scripts": "true",
                "forward_direct_link_params": "false",
                "frp_status": "stopped",
                "hide_files": "/\\/README.md/i",
                "home_container": "max_980px",
                "home_icon": "🏠",
                "iframe_previews": "{\n\t\"doc,docx,xls,xlsx,ppt,pptx\": {\n\t\t\"Microsoft\":\"https://view.officeapps.live.com/op/view.aspx?src=$e_url\",\n\t\t\"Google\":\"https://docs.google.com/gview?url=$e_url&embedded=true\"\n\t},\n\t\"pdf\": {\n\t\t\"PDF.js\":\"https://alist-org.github.io/pdf.js/web/viewer.html?file=$e_url\"\n\t},\n\t\"epub\": {\n\t\t\"EPUB.js\":\"https://alist-org.github.io/static/epub.js/viewer.html?url=$e_url\"\n\t}\n}",
                "ignore_direct_link_params": "sign,alist_ts",
                "ldap_login_enabled": "false",
                "ldap_login_tips": "login with ldap",
                "logo": "https://nnp.nekopara.us/favicon.ico",
                "main_color": "#f53d7d",
                "max_devices": "0",
                "ocr_api": "",
                "package_download": "true",
                "pagination_type": "all",
                "preview_archives_by_default": "true",
                "readme_autorender": "true",
                "robots_txt": "User-agent: *\nAllow: /",
                "search_index": "none",
                "settings_layout": "list",
                "site_title": "CubylistV3",
                "sso_compatibility_mode": "false",
                "sso_login_enabled": "false",
                "sso_login_platform": "",
                "thumbnail_size": "144",
                "use_newui": "false",
                "version": "v3.60.0",
                "video_autoplay": "true",
                "webauthn_login_enabled": "false"
            }
        };

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization"
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