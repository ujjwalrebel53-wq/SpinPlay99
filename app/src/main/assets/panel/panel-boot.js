window.REBEL_NATIVE_APP = true;
function rebelApiPost(endpoint, body) {
  if (window.RebelAndroid && typeof RebelAndroid.apiPost === 'function') {
    try {
      return JSON.parse(RebelAndroid.apiPost(endpoint, JSON.stringify(body || {})));
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  return null;
}
function rebelHideApkDownloadUi() {
  if (!window.REBEL_NATIVE_APP) return;
  document.querySelectorAll('.apk-dl-card, .apk-dl-btn').forEach(function (el) {
    el.style.display = 'none';
  });
  document.querySelectorAll('a.menu-item[download]').forEach(function (el) {
    el.style.display = 'none';
  });
}
