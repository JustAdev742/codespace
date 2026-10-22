/**
 * @license AGPL-3.0
 * Blooket Cheats
 * Copyright (C) 2023-present 05Konz
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 * 
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * 
 * Source: https://github.com/Blooket-Council/Blooket-Cheats 05konz994@gmail.com
*/

(() => {
    // A hidden iframe gives us native alert/prompt/confirm even if the page overrode them.
    let iframe = document.querySelector("iframe");
    if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.append(iframe);
    }
    /* Stop Blooket's cheat-detection pings to s.blooket.com/rc (by CryptoDude3) */
    if (window.fetch.call.toString() == "function call() { [native code] }") {
        const call = window.fetch.call;
        window.fetch.call = function () {
            if (!arguments[1].includes("s.blooket.com/rc")) return call.apply(this, arguments);
        };
    }

    // --- Robust, React-version-agnostic game state-node resolver ----------
    // Every cheat needs the game screen's React class-component instance.
    // The old code read it from element._owner and fixed child indices;
    // React 19 no longer sets _owner, and any markup change broke the fixed
    // path. This reads the React fiber (via the __reactFiber$ /
    // __reactInternalInstance$ key, not _owner), finds it even if Blooket
    // renames its root container, walks the fiber tree, and feature-detects
    // the game component. Falls back to the legacy method if all else fails,
    // so it is never worse than before.
    const __bcFiber = (el) => {
        if (!el) return null;
        const k = Object.keys(el).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
        return k ? el[k] : null;
    };
    const __bcFiberAny = () => {
        // Known roots first, then scan the DOM so a renamed/moved container
        // cannot hide the fiber from us.
        const seeds = [document.querySelector("#app"), document.querySelector("#root"), document.querySelector("body>div")];
        for (const el of seeds) { const f = __bcFiber(el); if (f) return f; }
        const all = document.querySelectorAll("div");
        for (let i = 0; i < all.length; i++) { const f = __bcFiber(all[i]); if (f) return f; }
        return null;
    };
    const __bcIsGame = (sn) =>
        !!(sn && sn.state && sn.props && (sn.props.liveGameController || sn.props.client || "question" in sn.state || "stage" in sn.state));
    const __bcScore = (sn) => {
        let s = 0;
        if (sn.props.liveGameController) s += 4;
        if (sn.props.client) s += 2;
        if (sn.state && ("question" in sn.state || "stage" in sn.state)) s += 1;
        return s;
    };
    const __bcResolve = () => {
        let f = __bcFiberAny();
        if (f) {
            while (f.return) f = f.return;
            const stack = [f], seen = new Set();
            let best = null, bestScore = -1;
            while (stack.length) {
                const node = stack.pop();
                if (!node || seen.has(node)) continue;
                seen.add(node);
                const sn = node.stateNode;
                if (__bcIsGame(sn)) {
                    const sc = __bcScore(sn);
                    if (sc > bestScore) { bestScore = sc; best = sn; }
                    if (sc >= 7) break;
                }
                if (node.child) stack.push(node.child);
                if (node.sibling) stack.push(node.sibling);
            }
            if (best) return best;
        }
        // Legacy pre-React-19 fallback: the original _owner-based lookup.
        try {
            return Object.values(
                (function react(r = document.querySelector("body>div")) {
                    return Object.values(r)[1]?.children?.[0]?._owner?.stateNode ? r : react(r.querySelector(":scope>div"));
                })()
            )[1].children[0]._owner.stateNode;
        } catch (e) {
            return null;
        }
    };
    const __bcOwner = () => ({ stateNode: __bcResolve() });
    const __bcTyping = () => {
        const el = document.querySelector("[class*='typingAnswerWrapper']");
        let f = __bcFiber(el);
        const stack = f ? [f] : [], seen = new Set();
        while (f) {
            if (f.stateNode && typeof f.stateNode.sendAnswer === "function") return f.stateNode;
            f = f.return;
        }
        while (stack.length) {
            const n = stack.pop();
            if (!n || seen.has(n)) continue;
            seen.add(n);
            if (n.stateNode && typeof n.stateNode.sendAnswer === "function") return n.stateNode;
            if (n.child) stack.push(n.child);
            if (n.sibling) stack.push(n.sibling);
        }
        return {};
    };
    // ----------------------------------------------------------------------
    const cheat = (async () => {
        const prices = [0, 0, 0, 0];
        let { stateNode } = __bcOwner();
        stateNode.setState({ blooks: stateNode.state.blooks.map(blook => (blook.price = prices, blook)) });
    });
    cheat();
})();
