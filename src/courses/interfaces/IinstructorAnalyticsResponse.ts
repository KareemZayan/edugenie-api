export interface InstructorAnalyticsResponse {
  stats: {
    totalEarnings: number;
    earningsGrowth: number;
    pendingPayouts: number;
    nextPayoutDate: string;
    totalStudents: number;
    studentsGrowth: number;
  };

  revenueChart: {
    labels: string[];
    data: number[];
  };

  recentSales: Array<{
    id: string;
    studentName: string;
    courseTitle: string;
    itemType: 'course' | 'section';
    sectionTitle?: string;
    date: string;
    price: number;
    status: 'COMPLETED' | 'REFUNDED';
  }>;
}
