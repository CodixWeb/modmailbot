/*
 *   Copyright (c) 2024
 *   All rights reserved.
 */
const moment = require("moment");
const threads = require("../data/threads");
const utils = require("../utils");

const {THREAD_STATUS} = require("../data/constants");
const {getOrFetchChannel} = require("../utils");

module.exports = ({ bot, knex, config, commands }) => {
  if (! config.allowSuspend) return;
  // Check for threads that are scheduled to be suspended and suspend them
  async function applyScheduledSuspensions() {
    const threadsToBeSuspended = await threads.getThreadsThatShouldBeSuspended();
    for (const thread of threadsToBeSuspended) {
      if (thread.status === THREAD_STATUS.OPEN) {
        await thread.suspend();
        await thread.postSystemMessage(`**Thread suspended** as scheduled by ${thread.scheduled_suspend_name}. Ce fil de discussion sera fermé jusqu'à ce qu'il soit suspendu avec \`${config.prefix}unsuspend\``);
      }
    }
  }

  async function scheduledSuspendLoop() {
    try {
      await applyScheduledSuspensions();
    } catch (e) {
      console.error(e);
    }

    setTimeout(scheduledSuspendLoop, 2000);
  }

  scheduledSuspendLoop();

  commands.addInboxThreadCommand("suspend cancel", [], async (msg, args, thread) => {
    // Cancel timed suspend
    if (thread.scheduled_suspend_at) {
      await thread.cancelScheduledSuspend();
      thread.postSystemMessage("Suspension programmée annulée");
    } else {
      thread.postSystemMessage("Il n'est pas prévu que le sujet soit suspendu");
    }
  });

  commands.addInboxThreadCommand("suspend", "[delay:delay]", async (msg, args, thread) => {
    if (thread.status === THREAD_STATUS.SUSPENDED) {
      thread.postSystemMessage("Le sujet est déjà suspendu.");
      return;
    }
    if (args.delay) {
      const suspendAt = moment.utc().add(args.delay, "ms");
      await thread.scheduleSuspend(suspendAt.format("YYYY-MM-DD HH:mm:ss"), msg.author);

      thread.postSystemMessage(`Le sujet sera suspendu dans ${utils.humanizeDelay(args.delay)}. Utiliser \`${config.prefix}suspend cancel\` pour annuler.`);

      return;
    }

    await thread.suspend();
    thread.postSystemMessage(`**Sujet suspendu!** Ce fil de discussion sera fermé jusqu'à ce qu'il soit suspendu avec \`${config.prefix}unsuspend\``);
  }, { allowSuspended: true });

  commands.addInboxServerCommand("unsuspend", [], async (msg, args, thread) => {
    if (thread) {
      thread.postSystemMessage("Le fil n'est pas suspendu");
      return;
    }

    thread = await threads.findSuspendedThreadByChannelId(msg.channel.id);
    if (! thread) {
      const channel = await getOrFetchChannel(bot, msg.channel.id);
      channel.createMessage("Pas dans un fil");
      return;
    }

    const otherOpenThread = await threads.findOpenThreadByUserId(thread.user_id);
    if (otherOpenThread) {
      thread.postSystemMessage(`Impossible de réactiver la suspension; il y a un autre fil de discussion ouvert avec cet utilisateur: <#${otherOpenThread.channel_id}>`);
      return;
    }

    await thread.unsuspend();
    thread.postSystemMessage("**Sujet non suspendu!**");
  });
};
