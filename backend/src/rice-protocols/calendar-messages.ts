/** Wording of reminder and missed-activity messages, in the farmer's own language (sw or en). */
export type Lang = 'sw' | 'en';

export const toLang = (language?: string | null): Lang =>
  language === 'en' ? 'en' : 'sw';

export interface MessageInput {
  lang: Lang;
  title: string;
  farmCode: string;
  /** 0 = due today, 1 = due tomorrow, n = due in n days. */
  daysAhead?: number;
  dueDate?: Date;
}

const day = (d?: Date) =>
  d ? d.toLocaleDateString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' }) : '';

export function reminderMessage({
  lang,
  title,
  farmCode,
  daysAhead = 1,
}: MessageInput) {
  if (lang === 'en') {
    const when =
      daysAhead <= 0
        ? 'Today'
        : daysAhead === 1
          ? 'Tomorrow'
          : `In ${daysAhead} days`;
    return {
      title: `${when}: ${title}`,
      body: `${when} on farm ${farmCode}: ${title}. Open the app to record it when it is done.`,
      sms: `MAYODE: ${when}: ${title} on farm ${farmCode}. Open the app to record it.`,
    };
  }
  const when =
    daysAhead <= 0
      ? 'Leo'
      : daysAhead === 1
        ? 'Kesho'
        : `Baada ya siku ${daysAhead}`;
  return {
    title: `${when}: ${title}`,
    body: `${when} shambani ${farmCode}: ${title}. Fungua programu kuirekodi ukimaliza.`,
    sms: `MAYODE: ${when}: ${title} shambani ${farmCode}. Fungua programu kuirekodi.`,
  };
}

export function missedMessage({
  lang,
  title,
  farmCode,
  dueDate,
}: MessageInput) {
  if (lang === 'en') {
    return {
      title: `Not done: ${title}`,
      body: `${title} on farm ${farmCode} was due on ${day(dueDate)} and has not been recorded. Please do it and record it in the app.`,
      sms: `MAYODE: Not done: ${title} on farm ${farmCode} was due ${day(dueDate)}. Please do it and record it in the app.`,
    };
  }
  return {
    title: `Haijafanyika: ${title}`,
    body: `${title} shambani ${farmCode} ilikuwa tarehe ${day(dueDate)} na haijarekodiwa. Tafadhali ifanye na uirekodi kwenye programu.`,
    sms: `MAYODE: Haijafanyika: ${title} shambani ${farmCode} ilikuwa tarehe ${day(dueDate)}. Tafadhali ifanye na uirekodi kwenye programu.`,
  };
}
