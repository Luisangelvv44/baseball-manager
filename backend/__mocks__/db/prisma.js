const createModel = () => ({
  findFirst: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  createMany: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  deleteMany: jest.fn(),
  count: jest.fn(),
});

const prismaMock = {
  season: createModel(),
  team: createModel(),
  player: createModel(),
  gameSchedule: createModel(),
  finance: createModel(),
  freeAgentAuction: createModel(),
  auctionBid: createModel(),
  stadiumSection: createModel(),
  teamLineup: createModel(),
  playoffSeries: createModel(),
  seasonRecord: createModel(),
  scout: createModel(),
  gameEvent: createModel(),
  gameLineup: createModel(),
  draft: createModel(),
  coach: createModel(),
  newsItem: createModel(),
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

module.exports = prismaMock;
