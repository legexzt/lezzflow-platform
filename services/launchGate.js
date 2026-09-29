'use strict';

/**
 * Cluster launch gate (GTM cycle-2, enforced cycle-3):
 * a locality / discovery ring goes "live" for customers only when at least
 * this many shops are live and accepting orders. Below the threshold the app
 * shows "jald aa rahe hain" — never a thin, disappointing shop list.
 */
const LAUNCH_GATE_MIN_SHOPS = 25;

module.exports = { LAUNCH_GATE_MIN_SHOPS };
