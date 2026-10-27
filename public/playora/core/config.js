/* Site settings. Room IDs are matched by this site (no external relay). */
window.PLAYORA={
 /* STUN finds a direct route. /api/ice adds TURN from server-side environment
    variables for players on strict networks. */
 iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302','stun:stun.cloudflare.com:3478']}],
 iceUrl:'/api/ice'
};
