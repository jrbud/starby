// Timed session events: things that happen after the app has been open a while.
// Also an example of using the scheduler (ctx.after / ctx.every) and reading the
// event log (ctx.events) to react to what has already happened.
// Owner: whoever wants it (fits with Person 3's speech work). Add events freely.

// [seconds since app opened, line]
const MILESTONES = [
  [10 * 60, "we've been hanging out for 10 minutes!"],
  [30 * 60, 'half an hour already~'],
  [60 * 60, 'one whole hour together!'],
  [2 * 60 * 60, 'two hours! maybe stretch a little?'],
];

const STREAK_CHECK_EVERY = 5 * 60; // seconds
const STREAK_MIN = 5; // starbits picked up within one check window to count as a streak

export default {
  name: 'session-events',

  init(ctx) {
    for (const [seconds, line] of MILESTONES) {
      ctx.after(seconds, () => {
        ctx.say(line, 4000);
        ctx.log('milestone', { minutes: seconds / 60 });
      }, `milestone ${seconds / 60}m`);
    }

    // Every few minutes, look back through the log: did the user collect a lot of starbits?
    ctx.every(STREAK_CHECK_EVERY, () => {
      const collected = ctx.events
        .since(STREAK_CHECK_EVERY)
        .filter((e) => e.type === 'starbits' && e.data.delta > 0)
        .reduce((sum, e) => sum + e.data.delta, 0);
      if (collected >= STREAK_MIN && !ctx.isSpeaking()) {
        ctx.say(`${collected} starbits in ${STREAK_CHECK_EVERY / 60} minutes, nice!`, 3000);
      }
    }, 'starbits streak check');
  },
};
