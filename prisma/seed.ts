import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const memoryCount = await prisma.memory.count();

  if (memoryCount === 0) {
    await prisma.memory.createMany({
      data: [
        {
          type: "emotion",
          content: "用户最近感觉自己越来越不像自己，像是在每天完成任务。",
          emotion: "迷茫, 疲惫",
          importance: 8,
          confidence: 0.86,
        },
        {
          type: "unfinished_wish",
          content: "用户有一个迟迟没有真正开始或完成的项目。",
          emotion: "遗憾, 犹豫",
          importance: 7,
          confidence: 0.74,
        },
        {
          type: "decision_pattern",
          content: "用户在面对重要选择时容易把问题想得很大，因此被压力阻住行动。",
          emotion: "焦虑",
          importance: 7,
          confidence: 0.79,
        },
      ],
    });
  }

  const profileCount = await prisma.profileDocument.count();

  if (profileCount === 0) {
    await prisma.profileDocument.createMany({
      data: [
        {
          section: "soul",
          title: "灵魂摘要",
          content:
            "你像一个长期把自己放在后面的人。你并不是没有愿望，而是太习惯先确认现实是否允许你拥有愿望。",
        },
        {
          section: "decision_rules",
          title: "决策规则",
          content:
            "当问题太大时，优先设计一个今天可以完成的小实验。不要让焦虑替你预测整个人生。",
        },
      ],
    });
  }

  const worldCount = await prisma.worldState.count();

  if (worldCount === 0) {
    await prisma.worldState.create({
      data: {
        mood: "起雾",
        scene: "情绪湖",
        energy: 46,
        clarity: 38,
        diary:
          "今天，另一个你坐在湖边。湖面起了雾。他知道你不是不想往前走，只是太久没有听见自己的声音。",
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
