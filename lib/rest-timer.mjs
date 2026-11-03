export const remainingSeconds = (deadline, now = Date.now()) => deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
