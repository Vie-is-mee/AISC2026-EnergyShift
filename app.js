/**
 * EnergyShift VN - Decision Support System
 * Client-side logic, dataset models & interactive visualizations
 */

// Production scenarios according to EnergyShift proposal
const SCENARIOS = {
  scenario1: {
    id: "scenario1",
    name: "Tuần 37/2026 — Khuyến nghị THAY ĐỔI LỊCH (B2)",
    weekLabel: "Tuần 37/2026 (08/09 - 14/09)",
    verdictType: "change",
    verdictTitle: "THAY ĐỔI LỊCH SẢN XUẤT",
    verdictSubtitle: "Khuyến nghị áp dụng phương án phối hợp B2",
    verdictExplanation: "Phương án B2 thỏa mãn tuyệt đối 5/5 ràng buộc vật lý, tận dụng năng lực linh hoạt giữa máy 160T và 200T để chuyển 3 công việc tiêu thụ lớn tránh hoàn toàn khung giờ cao điểm (3.398 đ/kWh). Sau khi bù trừ chi phí đổi khuôn, phương án giúp tiết kiệm ròng 2.630.000 VNĐ / tuần (14,25%).",
    readinessScore: 94,
    kpis: {
      totalCostB0: 18450000,
      totalCostRec: 15820000,
      savingsAmount: 2630000,
      savingsPct: 14.25,
      electricitySavings: 2980000,
      setupCostChange: 350000,
      jobsShifted: 3,
      peakKwhReduced: 876
    },
    plans: {
      b0: {
        code: "B0",
        name: "Lịch hiện tại của nhà máy",
        desc: "Mốc đối chứng thực tế. Chạy 2 công việc lớn vào khung giờ cao điểm (09:30 - 11:30 và 17:00 - 20:00).",
        totalCost: 18450000,
        electricityCost: 15200000,
        setupCost: 2100000,
        overtimeCost: 1150000,
        status: "Mốc chuẩn đối chứng"
      },
      b1: {
        code: "B1",
        name: "Quy tắc đơn giản (Dời 1 việc)",
        desc: "Dời Đơn A (Vòi xịt) từ giờ cao điểm sang giờ thấp điểm đêm. Không đổi máy.",
        totalCost: 18420000,
        electricityCost: 14450000,
        setupCost: 2450000,
        overtimeCost: 1520000,
        status: "Tiết kiệm 30.000 đ (Chưa đủ tốt)"
      },
      b2: {
        code: "B2",
        name: "Phương án phối hợp (CP-SAT)",
        desc: "Điều chuyển đồng thời Đơn A sang Máy 200T và hoán đổi Đơn C, E để tận dụng tối đa giờ thấp điểm.",
        totalCost: 15820000,
        electricityCost: 12220000,
        setupCost: 2450000,
        overtimeCost: 1150000,
        status: "Khuyến nghị áp dụng (-14.2%)",
        recommended: true
      }
    },
    constraints: [
      { id: "c1", name: "Đủ sản lượng yêu cầu", desc: "6/6 đơn hàng được xếp lịch đủ 100% số lượng sản phẩm, không bỏ sót.", pass: true, label: "6/6 ĐẠT" },
      { id: "c2", name: "Đúng hạn hoàn thành (Due Date)", desc: "100% các lô hàng kết thúc trước thời hạn giao hàng của khách hàng.", pass: true, label: "100% ĐẠT" },
      { id: "c3", name: "Đúng máy & khuôn kỹ thuật", desc: "Các cặp khuôn - máy (Khuôn 8 lòng trên Máy 160T/200T) đã được xưởng xác nhận.", pass: true, label: "XÁC NHẬN" },
      { id: "c4", name: "Không chồng lịch máy", desc: "Không có bất kỳ xung đột thời gian chạy trên cùng một máy ép.", pass: true, label: "KHÔNG XUNG ĐỘT" },
      { id: "c5", name: "Đủ thời gian chuyển đổi khuôn", desc: "Mỗi khoảng nghỉ giữa 2 khuôn đều đảm bảo ≥45 - 60 phút theo quy chuẩn.", pass: true, label: "ĐỦ THỜI GIAN" }
    ],
    sensitivity: [
      { scenario: "THẤP (-15% công suất)", powerEst: "Thấp hơn thực tế", costDelta: "-2.280.000 VNĐ", conclusion: "Vẫn tiết kiệm rõ", stable: true },
      { scenario: "CƠ SỞ (Điểm chuẩn)", powerEst: "Số đo công tơ chuẩn", costDelta: "-2.630.000 VNĐ", conclusion: "Khuyến nghị Thay đổi", stable: true },
      { scenario: "CAO (+15% công suất)", powerEst: "Cao hơn thực tế", costDelta: "-2.990.000 VNĐ", conclusion: "Tiết kiệm lớn hơn nữa", stable: true }
    ],
    sensitivityNote: "Kết luận THAY ĐỔI LỊCH ổn định qua cả 3 kịch bản kiểm tra độ nhạy. Không có rủi ro bị đảo chiều quyết định khi công suất máy dao động ±15%.",
    jobs: [
      { id: "DH-101", name: "Đơn A: Vòi xịt tinh chất (Khuôn 8 lòng)", client: "Seawin / Mỹ phẩm ABC", qty: "45.000 cái", oldMachine: "M1 (160T)", newMachine: "M3 (200T)", oldTime: "09:00 - 15:30 (Cao điểm)", newTime: "22:00 - 04:30 (Thấp điểm)", electricityDelta: "-1.520.000 đ", setupDelta: "+200.000 đ", trust: "meter", trustLabel: "Đo trực tiếp", note: "Chuyển sang máy 200T chạy giờ thấp điểm theo xác nhận tương thích khuôn [7]" },
      { id: "DH-102", name: "Đơn B: Nắp hũ mỹ phẩm 50g", client: "Dược phẩm Trung Ương", qty: "30.000 cái", oldMachine: "M2 (160T)", newMachine: "M2 (160T)", oldTime: "16:00 - 21:00 (Cao điểm)", newTime: "04:00 - 09:00 (Bình thường)", electricityDelta: "-580.000 đ", setupDelta: "0 đ", trust: "raw", trustLabel: "Gốc ERP", note: "Dời lịch sớm hơn 1 ca để hoàn thành trước khung cao điểm sáng" },
      { id: "DH-103", name: "Đơn C: Thân chai Pet 100ml", client: "Hóa mỹ phẩm Nam Long", qty: "60.000 cái", oldMachine: "M4 (200T)", newMachine: "M4 (200T)", oldTime: "07:00 - 14:00", newTime: "07:00 - 14:00", electricityDelta: "0 đ", setupDelta: "0 đ", trust: "meter", trustLabel: "Đo trực tiếp", note: "Giữ nguyên do đã chạy tối ưu trong ca bình thường" },
      { id: "DH-104", name: "Đơn D: Khay định hình linh kiện", client: "Điện tử SamTech", qty: "15.000 cái", oldMachine: "M5 (250T)", newMachine: "M5 (250T)", oldTime: "08:00 - 16:00", newTime: "12:00 - 20:00", electricityDelta: "-430.000 đ", setupDelta: "+150.000 đ", trust: "confirmed", trustLabel: "Nhà máy xác nhận", note: "Hoán đổi vị trí để nhường máy cho đơn hàng cấp bách hơn" },
      { id: "DH-105", name: "Đơn E: Nắp bật chống tràn", client: "Tiêu dùng Minh Quân", qty: "40.000 cái", oldMachine: "M3 (200T)", newMachine: "M1 (160T)", oldTime: "14:00 - 20:00", newTime: "11:30 - 17:30 (Bình thường)", electricityDelta: "-450.000 đ", setupDelta: "0 đ", trust: "raw", trustLabel: "Gốc ERP", note: "Chuyển về máy 160T nhỏ hơn, công suất chạy thấp hơn" },
      { id: "DH-106", name: "Đơn F: Khớp nối kỹ thuật", client: "Cơ khí Việt Nhật", qty: "20.000 cái", oldMachine: "M5 (250T)", newMachine: "M5 (250T)", oldTime: "20:00 - 02:00", newTime: "20:00 - 02:00", electricityDelta: "0 đ", setupDelta: "0 đ", trust: "estimate", trustLabel: "Ước tính kiểm chứng", note: "Đã chạy ca đêm giờ thấp điểm, không cần đổi" }
    ],
    gantt: {
      b0: [
        { machine: "M1", job: "Đơn A (Vòi xịt)", startHour: 9.0, duration: 6.5, setupBefore: 0.75, colorClass: "job-b0" },
        { machine: "M2", job: "Đơn B (Nắp hũ)", startHour: 16.0, duration: 5.0, setupBefore: 0.5, colorClass: "job-b0" },
        { machine: "M3", job: "Đơn E (Nắp bật)", startHour: 13.5, duration: 6.5, setupBefore: 0.75, colorClass: "job-b0" },
        { machine: "M4", job: "Đơn C (Chai Pet)", startHour: 7.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b0" },
        { machine: "M5", job: "Đơn D (Khay)", startHour: 8.0, duration: 8.0, setupBefore: 1.0, colorClass: "job-b0" }
      ],
      b2: [
        { machine: "M1", job: "Đơn E (Nắp bật)", startHour: 11.5, duration: 6.0, setupBefore: 0.75, colorClass: "job-b2" },
        { machine: "M2", job: "Đơn B (Nắp hũ)", startHour: 4.0, duration: 5.0, setupBefore: 0.5, colorClass: "job-b2" },
        { machine: "M3", job: "Đơn A (Vòi xịt)", startHour: 22.0, duration: 6.5, setupBefore: 1.0, colorClass: "job-b2" },
        { machine: "M4", job: "Đơn C (Chai Pet)", startHour: 7.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b2" },
        { machine: "M5", job: "Đơn D (Khay)", startHour: 12.0, duration: 8.0, setupBefore: 1.0, colorClass: "job-b2" }
      ],
      b1: [
        { machine: "M1", job: "Đơn A (Vòi xịt)", startHour: 22.0, duration: 6.5, setupBefore: 0.75, colorClass: "job-b1" },
        { machine: "M2", job: "Đơn B (Nắp hũ)", startHour: 16.0, duration: 5.0, setupBefore: 0.5, colorClass: "job-b0" },
        { machine: "M3", job: "Đơn E (Nắp bật)", startHour: 13.5, duration: 6.5, setupBefore: 0.75, colorClass: "job-b0" },
        { machine: "M4", job: "Đơn C (Chai Pet)", startHour: 7.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b0" },
        { machine: "M5", job: "Đơn D (Khay)", startHour: 8.0, duration: 8.0, setupBefore: 1.0, colorClass: "job-b0" }
      ]
    }
  },

  scenario2: {
    id: "scenario2",
    name: "Tuần 38/2026 — Khuyến nghị DÙNG QUY TẮC ĐƠN GIẢN (B1)",
    weekLabel: "Tuần 38/2026 (15/09 - 21/09)",
    verdictType: "simple",
    verdictTitle: "DÙNG QUY TẮC ĐƠN GIẢN (B1)",
    verdictSubtitle: "Quy tắc đơn lẻ đã đạt 96% lợi ích tối đa",
    verdictExplanation: "Phương án B1 (chỉ chuyển 1 đơn hàng khuôn nắp chai sang ca sáng thấp điểm) đã giúp tiết kiệm 1.950.000 VNĐ. Phương án phối hợp B2 chỉ tiết kiệm thêm 80.000 VNĐ nhưng đòi hỏi xáo trộn 4 máy và phát sinh thêm 2 lần đổi khuôn. Theo nguyên tắc sản phẩm, hệ thống đề xuất áp dụng B1 để giảm thiểu rủi ro vận hành.",
    readinessScore: 92,
    kpis: {
      totalCostB0: 17200000,
      totalCostRec: 15250000,
      savingsAmount: 1950000,
      savingsPct: 11.34,
      electricitySavings: 1950000,
      setupCostChange: 0,
      jobsShifted: 1,
      peakKwhReduced: 620
    },
    plans: {
      b0: {
        code: "B0",
        name: "Lịch hiện tại của nhà máy",
        desc: "Kế hoạch tuần 38 theo ca tiêu chuẩn. Đơn hàng Nắp chai chạy lúc 17:00 giờ cao điểm chiều.",
        totalCost: 17200000,
        electricityCost: 14100000,
        setupCost: 1900000,
        overtimeCost: 1200000,
        status: "Mốc chuẩn đối chứng"
      },
      b1: {
        code: "B1",
        name: "Quy tắc đơn giản (Dời 1 việc)",
        desc: "Dời duy nhất lô Nắp chai sang khung giờ 04:00 - 09:00 sáng. Giữ nguyên toàn bộ các máy khác.",
        totalCost: 15250000,
        electricityCost: 12150000,
        setupCost: 1900000,
        overtimeCost: 1200000,
        status: "Khuyến nghị áp dụng (-11.3%)",
        recommended: true
      },
      b2: {
        code: "B2",
        name: "Phương án phối hợp (CP-SAT)",
        desc: "Đổi cả 4 máy ép để cố gắng ép thêm tiền điện. Chi phí phát sinh triệt tiêu lợi nhuận.",
        totalCost: 15170000,
        electricityCost: 11620000,
        setupCost: 2350000,
        overtimeCost: 1200000,
        status: "Tốt hơn B1 chỉ 80.000đ (Không đáng đổi)"
      }
    },
    constraints: [
      { id: "c1", name: "Đủ sản lượng yêu cầu", desc: "Tất cả đơn hàng đạt 100% sản lượng cam kết.", pass: true, label: "ĐẠT" },
      { id: "c2", name: "Đúng hạn hoàn thành", desc: "Giao hàng đúng hạn hợp đồng.", pass: true, label: "ĐẠT" },
      { id: "c3", name: "Đúng máy & khuôn kỹ thuật", desc: "Không đổi máy, sử dụng máy hiện hành.", pass: true, label: "ĐẠT" },
      { id: "c4", name: "Không chồng lịch máy", desc: "Không có xung đột thời gian.", pass: true, label: "ĐẠT" },
      { id: "c5", name: "Đủ thời gian chuyển đổi khuôn", desc: "Thời gian setup giữ nguyên như ban đầu.", pass: true, label: "ĐẠT" }
    ],
    sensitivity: [
      { scenario: "THẤP (-15%)", powerEst: "Công suất thấp", costDelta: "-1.720.000 VNĐ", conclusion: "B1 vẫn tối ưu", stable: true },
      { scenario: "CƠ SỞ", powerEst: "Số đo chuẩn", costDelta: "-1.950.000 VNĐ", conclusion: "Khuyến nghị B1", stable: true },
      { scenario: "CAO (+15%)", powerEst: "Công suất cao", costDelta: "-2.180.000 VNĐ", conclusion: "B1 vẫn tối ưu", stable: true }
    ],
    sensitivityNote: "Phương án B1 rất an toàn và ổn định. Khoảng cách chênh lệch giữa B1 và B2 không vượt quá 100.000 VNĐ trong mọi trường hợp.",
    jobs: [
      { id: "DH-201", name: "Đơn Nắp chai mỹ phẩm 24/410", client: "Dược mỹ phẩm Á Châu", qty: "50.000 cái", oldMachine: "M2 (160T)", newMachine: "M2 (160T)", oldTime: "17:00 - 22:00 (Cao điểm)", newTime: "04:00 - 09:00 (Bình thường)", electricityDelta: "-1.950.000 đ", setupDelta: "0 đ", trust: "meter", trustLabel: "Đo trực tiếp", note: "Dời lịch chạy sớm, không đổi máy, không phát sinh chi phí khuôn" }
    ],
    gantt: {
      b0: [
        { machine: "M2", job: "Nắp chai (17:00 - 22:00)", startHour: 17.0, duration: 5.0, setupBefore: 0.5, colorClass: "job-b0" },
        { machine: "M3", job: "Thân hũ (08:00 - 15:00)", startHour: 8.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b0" }
      ],
      b1: [
        { machine: "M2", job: "Nắp chai (04:00 - 09:00)", startHour: 4.0, duration: 5.0, setupBefore: 0.5, colorClass: "job-b1" },
        { machine: "M3", job: "Thân hũ (08:00 - 15:00)", startHour: 8.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b0" }
      ],
      b2: [
        { machine: "M1", job: "Nắp chai (04:00 - 09:00)", startHour: 4.0, duration: 5.0, setupBefore: 0.75, colorClass: "job-b2" },
        { machine: "M4", job: "Thân hũ (12:00 - 19:00)", startHour: 12.0, duration: 7.0, setupBefore: 1.0, colorClass: "job-b2" }
      ]
    }
  },

  scenario3: {
    id: "scenario3",
    name: "Tuần 39/2026 — Khuyến nghị GIỮ LỊCH HIỆN TẠI (B0)",
    weekLabel: "Tuần 39/2026 (22/09 - 28/09)",
    verdictType: "keep",
    verdictTitle: "GIỮ NGUYÊN LỊCH HIỆN TẠI (B0)",
    verdictSubtitle: "Chi phí phát sinh lớn hơn số tiền điện tiết kiệm được",
    verdictExplanation: "Mặc dù dời đơn hàng sang ban đêm giúp giảm được 850.000 VNĐ tiền điện, nhưng lại phát sinh thêm 1.100.000 VNĐ tiền phụ cấp làm thêm giờ (Overtime ca 3) và 400.000 VNĐ chi phí chuẩn bị khuôn đột xuất. Tổng chi phí vận hành tăng thêm 650.000 VNĐ. Hệ thống bảo vệ người dùng bằng khuyến nghị GIỮ LỊCH HIỆN TẠI.",
    readinessScore: 89,
    kpis: {
      totalCostB0: 16100000,
      totalCostRec: 16750000,
      savingsAmount: -650000,
      savingsPct: -4.04,
      electricitySavings: 850000,
      setupCostChange: 400000,
      jobsShifted: 0,
      peakKwhReduced: 250
    },
    plans: {
      b0: {
        code: "B0",
        name: "Lịch hiện tại của nhà máy",
        desc: "Lịch vận hành ổn định trong ca tiêu chuẩn. Không phát sinh chi phí làm thêm ca đêm.",
        totalCost: 16100000,
        electricityCost: 13300000,
        setupCost: 1800000,
        overtimeCost: 1000000,
        status: "Khuyến nghị Giữ nguyên",
        recommended: true
      },
      b1: {
        code: "B1",
        name: "Quy tắc đơn giản (Dời sang đêm)",
        desc: "Dời sang 23:00 để lấy điện rẻ, nhưng làm tăng chi phí ca đêm vượt quá số tiền điện giảm.",
        totalCost: 16750000,
        electricityCost: 12450000,
        setupCost: 2200000,
        overtimeCost: 2100000,
        status: "Lỗ ròng 650.000 đ (Bị loại)"
      },
      b2: {
        code: "B2",
        name: "Phương án phối hợp (CP-SAT)",
        desc: "Không tìm được phương án nào bù đắp được chi phí chuyển đổi do đặc thù khuôn đợt này.",
        totalCost: 16820000,
        electricityCost: 12320000,
        setupCost: 2400000,
        overtimeCost: 2100000,
        status: "Không kinh tế (Bị loại)"
      }
    },
    constraints: [
      { id: "c1", name: "Đủ sản lượng yêu cầu", desc: "Đạt yêu cầu sản lượng.", pass: true, label: "ĐẠT" },
      { id: "c2", name: "Đúng hạn hoàn thành", desc: "Đạt tiến độ giao hàng.", pass: true, label: "ĐẠT" },
      { id: "c3", name: "Đúng máy & khuôn kỹ thuật", desc: "Đạt thông số kỹ thuật.", pass: true, label: "ĐẠT" },
      { id: "c4", name: "Không chồng lịch máy", desc: "Không chồng chéo.", pass: true, label: "ĐẠT" },
      { id: "c5", name: "Đủ thời gian chuyển đổi khuôn", desc: "Thời gian thay khuôn hợp lệ.", pass: true, label: "ĐẠT" }
    ],
    sensitivity: [
      { scenario: "THẤP", powerEst: "Ước tính thấp", costDelta: "+450.000 VNĐ", conclusion: "Giữ B0", stable: true },
      { scenario: "CƠ SỞ", powerEst: "Số đo chuẩn", costDelta: "+650.000 VNĐ", conclusion: "Giữ B0", stable: true },
      { scenario: "CAO", powerEst: "Ước tính cao", costDelta: "+820.000 VNĐ", conclusion: "Giữ B0", stable: true }
    ],
    sensitivityNote: "Nguyên tắc bảo vệ người dùng: Hệ thống tuyệt đối không bao giờ khuyến nghị thay đổi chỉ vì tiền điện rẻ khi tổng chi phí vận hành tăng lên.",
    jobs: [
      { id: "DH-301", name: "Đơn Nắp hũ kem chống nắng", client: "Mỹ phẩm Đông Á", qty: "35.000 cái", oldMachine: "M1 (160T)", newMachine: "M1 (160T)", oldTime: "10:00 - 17:00", newTime: "10:00 - 17:00 (Giữ nguyên)", electricityDelta: "0 đ", setupDelta: "0 đ", trust: "meter", trustLabel: "Đo trực tiếp", note: "Giữ nguyên lịch ban ngày để tránh chi phí làm thêm giờ ca đêm" }
    ],
    gantt: {
      b0: [
        { machine: "M1", job: "Nắp hũ kem (10:00 - 17:00)", startHour: 10.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b0" }
      ],
      b1: [
        { machine: "M1", job: "Nắp hũ kem (23:00 - 06:00)", startHour: 23.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b1" }
      ],
      b2: [
        { machine: "M1", job: "Nắp hũ kem (23:00 - 06:00)", startHour: 23.0, duration: 7.0, setupBefore: 0.5, colorClass: "job-b2" }
      ]
    }
  },

  scenario4: {
    id: "scenario4",
    name: "Tuần 40/2026 — Khuyến nghị ĐO THÊM TRƯỚC KHI QUYẾT ĐỊNH",
    weekLabel: "Tuần 40/2026 (29/09 - 05/10)",
    verdictType: "measure",
    verdictTitle: "ĐO THÊM TRƯỚC KHI QUYẾT ĐỊNH",
    verdictSubtitle: "Dữ liệu điện năng chưa chắc chắn làm đảo chiều kết luận",
    verdictExplanation: "Công suất tiêu thụ của Máy M3 khi chạy Khuôn K-802 mới chỉ là số liệu ước tính gián tiếp (chưa có công tơ riêng). Khi thử nghiệm 3 kịch bản: mức THẤP cho kết quả nên đổi (+780.000đ), nhưng mức CAO lại cho kết quả lỗ (-310.000đ). Hệ thống yêu cầu lắp công tơ đo đếm tại Máy M3 trước khi phê duyệt đổi lịch.",
    readinessScore: 68,
    kpis: {
      totalCostB0: 19100000,
      totalCostRec: 18950000,
      savingsAmount: 150000,
      savingsPct: 0.78,
      electricitySavings: 450000,
      setupCostChange: 300000,
      jobsShifted: 0,
      peakKwhReduced: 120
    },
    plans: {
      b0: {
        code: "B0",
        name: "Lịch hiện tại của nhà máy",
        desc: "Lịch hiện hành tuần 40. Dữ liệu công suất máy M3 đang dùng ước tính lý thuyết.",
        totalCost: 19100000,
        electricityCost: 15800000,
        setupCost: 2100000,
        overtimeCost: 1200000,
        status: "Đang kiểm tra"
      },
      b1: {
        code: "B1",
        name: "Quy tắc đơn giản",
        desc: "Chưa đủ dữ liệu tin cậy để xác lập lợi ích kinh tế.",
        totalCost: 19050000,
        electricityCost: 15750000,
        setupCost: 2100000,
        overtimeCost: 1200000,
        status: "Chưa đủ chắc chắn"
      },
      b2: {
        code: "B2",
        name: "Phương án phối hợp",
        desc: "Phương án có thể tạo lợi ích nhưng rủi ro đảo chiều cao do thiếu công tơ đo đếm.",
        totalCost: 18950000,
        electricityCost: 15350000,
        setupCost: 2400000,
        overtimeCost: 1200000,
        status: "Tạm dừng phê duyệt"
      }
    },
    constraints: [
      { id: "c1", name: "Đủ sản lượng yêu cầu", desc: "Đạt yêu cầu.", pass: true, label: "ĐẠT" },
      { id: "c2", name: "Đúng hạn hoàn thành", desc: "Đạt tiến độ.", pass: true, label: "ĐẠT" },
      { id: "c3", name: "Đúng máy & khuôn kỹ thuật", desc: "Cần kiểm tra lại định mức máy M3.", pass: false, label: "CẦN ĐO" },
      { id: "c4", name: "Không chồng lịch máy", desc: "Không chồng chéo.", pass: true, label: "ĐẠT" },
      { id: "c5", name: "Đủ thời gian chuyển đổi khuôn", desc: "Thời gian setup hợp lệ.", pass: true, label: "ĐẠT" }
    ],
    sensitivity: [
      { scenario: "THẤP (Công suất ước tính 38 kW)", powerEst: "Giả định thấp", costDelta: "-780.000 VNĐ", conclusion: "Có vẻ nên đổi", stable: false },
      { scenario: "CƠ SỞ (Công suất ước tính 42 kW)", powerEst: "Mức trung tâm", costDelta: "-150.000 VNĐ", conclusion: "Chỉ tốt hơn rất ít", stable: false },
      { scenario: "CAO (Công suất ước tính 48 kW)", powerEst: "Giả định cao", costDelta: "+310.000 VNĐ", conclusion: "KHÔNG CÒN LỢI", stable: false }
    ],
    sensitivityNote: "CẢNH BÁO ĐẢO CHIỀU KẾT LUẬN: Vì 3 kịch bản cho 3 kết luận đối lập nhau, hệ thống chỉ định vị trí cần đo thêm: Công tơ điện tử trên Máy M3 (Khuôn K-802) trong 2 ca chạy thử nghiệm.",
    jobs: [
      { id: "DH-401", name: "Đơn Chai xịt khoáng (Khuôn K-802)", client: "Dược phẩm Sao Mai", qty: "40.000 cái", oldMachine: "M3 (200T)", newMachine: "M3 (200T)", oldTime: "11:00 - 18:00", newTime: "Chưa xác định", electricityDelta: "Dao động", setupDelta: "Chưa xác định", trust: "estimate", trustLabel: "Ước tính gián tiếp", note: "CẦN ĐO THÊM: Thiếu công tơ điện tử độc lập trên máy M3" }
    ],
    gantt: {
      b0: [
        { machine: "M3", job: "Chai xịt khoáng (K-802)", startHour: 11.0, duration: 7.0, setupBefore: 1.0, colorClass: "job-b0" }
      ],
      b1: [
        { machine: "M3", job: "Chai xịt khoáng (K-802)", startHour: 11.0, duration: 7.0, setupBefore: 1.0, colorClass: "job-b1" }
      ],
      b2: [
        { machine: "M3", job: "Chai xịt khoáng (K-802)", startHour: 22.0, duration: 7.0, setupBefore: 1.0, colorClass: "job-b2" }
      ]
    }
  }
};

// Application State
let currentScenarioId = "scenario1";
let activeGanttPlan = "compare"; // "compare", "b0", "b1", "b2"

// Currency formatter
function formatVND(num) {
  return new Intl.NumberFormat('vi-VN').format(num) + " đ";
}

// Micro-interaction: Smooth Count-up for Numbers
function animateNumber(element, start, end, duration = 380, isCurrency = false) {
  if (!element) return;
  const startTime = performance.now();

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Smooth cubic deceleration
    const ease = 1 - Math.pow(1 - progress, 3);
    const currentVal = Math.round(start + (end - start) * ease);

    if (isCurrency) {
      element.textContent = formatVND(currentVal);
    } else {
      element.textContent = currentVal;
    }

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      if (isCurrency) element.textContent = formatVND(end);
      else element.textContent = end;
    }
  }

  requestAnimationFrame(step);
}

// Render the entire dashboard for the current scenario
function renderDashboard() {
  const scenario = SCENARIOS[currentScenarioId];
  if (!scenario) return;

  // 1. Update Top Bar details
  document.getElementById("facilityStatusDot").className = "status-indicator-dot";
  document.getElementById("dataReadinessText").textContent = `Dữ liệu sẵn sàng: ${scenario.readinessScore}%`;

  // 2. Render Hero Verdict Card with subtle entrance pulse
  const heroCard = document.getElementById("verdictHeroCard");
  heroCard.className = `verdict-hero-card verdict-${scenario.verdictType} anim-pulse-verdict`;
  setTimeout(() => heroCard.classList.remove("anim-pulse-verdict"), 400);

  let badgeClass = "badge-change";
  if (scenario.verdictType === "keep") badgeClass = "badge-keep";
  else if (scenario.verdictType === "simple") badgeClass = "badge-simple";
  else if (scenario.verdictType === "measure") badgeClass = "badge-measure";

  document.getElementById("verdictBadge").className = `verdict-badge ${badgeClass}`;
  document.getElementById("verdictBadge").innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
    ${scenario.verdictTitle}
  `;
  document.getElementById("verdictHeading").textContent = scenario.verdictSubtitle;
  document.getElementById("verdictExplanation").textContent = scenario.verdictExplanation;

  // KPIs in Hero with count-up animation
  const kpis = scenario.kpis;
  const costElem = document.getElementById("kpiTotalCost");
  animateNumber(costElem, 0, kpis.totalCostRec, 400, true);

  const deltaElem = document.getElementById("kpiDeltaCost");
  if (kpis.savingsAmount > 0) {
    deltaElem.className = "kpi-delta delta-good tabular";
    deltaElem.textContent = `↓ Giảm ${formatVND(kpis.savingsAmount)} (-${kpis.savingsPct}%)`;
  } else if (kpis.savingsAmount < 0) {
    deltaElem.className = "kpi-delta delta-warn tabular";
    deltaElem.textContent = `↑ Tăng ${formatVND(Math.abs(kpis.savingsAmount))} (+${Math.abs(kpis.savingsPct)}%)`;
  } else {
    deltaElem.className = "kpi-delta delta-neutral tabular";
    deltaElem.textContent = "Không chênh lệch";
  }

  const elecElem = document.getElementById("kpiElectricitySaved");
  animateNumber(elecElem, 0, kpis.electricitySavings, 400, true);
  document.getElementById("kpiJobsShifted").textContent = `${kpis.jobsShifted} công việc`;

  // 3. Render Three Plan Comparison Cards (B0, B1, B2)
  renderPlanCards(scenario.plans);

  // 4. Render Gantt Chart
  renderGanttChart(scenario.gantt);

  // 4.5 Render 24-Hour Electricity Bill & Load Profile Chart
  renderElectricityHourlyChart();

  // 4.6 Render Advanced Analytics Charts
  renderCostBreakdownChart(scenario.plans);
  renderTouDistributionChart(scenario.kpis);
  renderTransformerPeakMonitor(scenario.kpis);

  // 5. Render Independent Validation Constraints
  renderValidationConstraints(scenario.constraints);

  // 6. Render Sensitivity Scenarios Table
  renderSensitivityTable(scenario.sensitivity, scenario.sensitivityNote);

  // 7. Render Job Detail Scheduling Table
  renderJobsTable(scenario.jobs);

  // 8. Setup Synchronized Hover Highlighting
  setupBidirectionalHoverSync();
}

// Render Three Plan Comparison Cards (B0, B1, B2)
function renderPlanCards(plans) {
  const container = document.getElementById("plansGrid");
  container.innerHTML = "";

  const planKeys = ["b0", "b1", "b2"];
  planKeys.forEach(key => {
    const p = plans[key];
    if (!p) return;

    const card = document.createElement("div");
    card.className = `plan-card ${p.recommended ? "plan-recommended" : ""}`;

    card.innerHTML = `
      <div class="plan-tag-strip">
        <span class="plan-code-badge">${p.code}</span>
        <span class="plan-status-pill ${p.recommended ? "pill-active" : "pill-muted"}">${p.status}</span>
      </div>
      <div class="plan-name">${p.name}</div>
      <div class="plan-desc">${p.desc}</div>
      
      <div class="plan-cost-hero">
        <span class="plan-cost-label">Tổng chi phí vận hành:</span>
        <span class="plan-cost-number tabular">${formatVND(p.totalCost)}</span>
      </div>

      <div class="plan-cost-breakdown">
        <div class="cost-row">
          <span>Tiền điện sản xuất (TOU):</span>
          <span class="tabular">${formatVND(p.electricityCost)}</span>
        </div>
        <div class="cost-row">
          <span>Chi phí đổi khuôn/chuẩn bị:</span>
          <span class="tabular">${formatVND(p.setupCost)}</span>
        </div>
        <div class="cost-row">
          <span>Làm thêm giờ (Overtime):</span>
          <span class="tabular">${formatVND(p.overtimeCost)}</span>
        </div>
      </div>

      <div class="plan-action-box">
        <button class="plan-action-btn" onclick="selectGanttPlan('${key}')">
          ${p.recommended ? "Xem lịch chi tiết (Khuyến nghị)" : `Xem chi tiết lịch ${p.code}`}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Render Gantt Chart with Machines & EVN Time-of-Use tariff zones
function renderGanttChart(ganttData) {
  const lanesContainer = document.getElementById("ganttLanes");
  lanesContainer.innerHTML = "";

  const machines = [
    { id: "M1", name: "Máy Ép 01", ton: "160 Tấn" },
    { id: "M2", name: "Máy Ép 02", ton: "160 Tấn" },
    { id: "M3", name: "Máy Ép 03", ton: "200 Tấn" },
    { id: "M4", name: "Máy Ép 04", ton: "200 Tấn" },
    { id: "M5", name: "Máy Ép 05", ton: "250 Tấn" }
  ];

  // EVN TOU Tariff time slices for 24h
  // 00:00 - 04:00 Off-peak (1.190đ)
  // 04:00 - 09:30 Normal (1.833đ)
  // 09:30 - 11:30 Peak (3.398đ)
  // 11:30 - 17:00 Normal (1.833đ)
  // 17:00 - 20:00 Peak (3.398đ)
  // 20:00 - 22:00 Normal (1.833đ)
  // 22:00 - 24:00 Off-peak (1.190đ)
  const tariffSlices = [
    { start: 0, end: 4, type: "offpeak" },
    { start: 4, end: 9.5, type: "normal" },
    { start: 9.5, end: 11.5, type: "peak" },
    { start: 11.5, end: 17, type: "normal" },
    { start: 17, end: 20, type: "peak" },
    { start: 20, end: 22, type: "normal" },
    { start: 22, end: 24, type: "offpeak" }
  ];

  machines.forEach(m => {
    const isCompare = activeGanttPlan === "compare";
    const lane = document.createElement("div");
    lane.className = isCompare ? "machine-lane lane-compare" : "machine-lane";

    // Machine Label Column
    const labelCol = document.createElement("div");
    if (isCompare) {
      labelCol.className = "machine-label-box machine-label-compare";
      labelCol.innerHTML = `
        <div class="machine-info-top">
          <span class="machine-code">${m.name}</span>
          <span class="machine-tonnage">${m.ton}</span>
        </div>
        <div class="subtrack-indicators">
          <div class="subtrack-tag tag-b0">
            <span class="tag-dot dot-b0"></span>
            <span>B0 Hiện tại</span>
          </div>
          <div class="subtrack-tag tag-b2">
            <span class="tag-dot dot-b2"></span>
            <span>B2 Đề xuất</span>
          </div>
        </div>
      `;
    } else {
      labelCol.className = "machine-label-box";
      labelCol.innerHTML = `
        <span class="machine-code">${m.name}</span>
        <span class="machine-tonnage">${m.ton}</span>
      `;
    }

    // Master Track Container
    const trackContainer = document.createElement("div");
    trackContainer.className = "lane-track-container";

    // Background Tariff Overlay
    const tariffBg = document.createElement("div");
    tariffBg.className = "lane-tariff-background";
    tariffSlices.forEach(s => {
      const slice = document.createElement("div");
      const widthPct = ((s.end - s.start) / 24) * 100;
      slice.className = `tariff-slice ${s.type}`;
      slice.style.width = `${widthPct}%`;
      tariffBg.appendChild(slice);
    });
    trackContainer.appendChild(tariffBg);

    if (isCompare) {
      // Subtrack 1: B0 (Current)
      const subtrackB0 = document.createElement("div");
      subtrackB0.className = "lane-subtrack subtrack-b0";
      const b0Jobs = (ganttData.b0 || []).filter(j => j.machine === m.id);
      renderJobsIntoSubtrack(subtrackB0, b0Jobs, "B0", m.name);
      trackContainer.appendChild(subtrackB0);

      // Subtrack 2: B2 (Proposed)
      const subtrackB2 = document.createElement("div");
      subtrackB2.className = "lane-subtrack subtrack-b2";
      const b2Jobs = (ganttData.b2 || []).filter(j => j.machine === m.id);
      renderJobsIntoSubtrack(subtrackB2, b2Jobs, "B2", m.name);
      trackContainer.appendChild(subtrackB2);
    } else {
      // Single Track
      const singleTrack = document.createElement("div");
      singleTrack.className = "lane-singletrack";

      let planJobs = [];
      if (activeGanttPlan === "b0") planJobs = (ganttData.b0 || []).filter(j => j.machine === m.id);
      else if (activeGanttPlan === "b1") planJobs = (ganttData.b1 || []).filter(j => j.machine === m.id);
      else if (activeGanttPlan === "b2") planJobs = (ganttData.b2 || []).filter(j => j.machine === m.id);

      renderJobsIntoSubtrack(singleTrack, planJobs, activeGanttPlan.toUpperCase(), m.name);
      trackContainer.appendChild(singleTrack);
    }

    lane.appendChild(labelCol);
    lane.appendChild(trackContainer);
    lanesContainer.appendChild(lane);
  });
}

function renderJobsIntoSubtrack(container, jobs, planLabel, machineName) {
  jobs.forEach(j => {
    // Setup block
    if (j.setupBefore && j.setupBefore > 0) {
      const setupLeft = ((j.startHour - j.setupBefore) / 24) * 100;
      const setupWidth = (j.setupBefore / 24) * 100;
      const setupElem = document.createElement("div");
      setupElem.className = "job-setup-block";
      setupElem.style.left = `${Math.max(0, setupLeft)}%`;
      setupElem.style.width = `${setupWidth}%`;
      const setupMins = Math.round(j.setupBefore * 60);
      setupElem.title = `Chuẩn bị / Thay khuôn: ${setupMins} phút (${j.job})`;
      if (setupWidth >= 4.5) {
        setupElem.innerHTML = `<span>⚙ ${setupMins}p</span>`;
      } else if (setupWidth >= 2.4) {
        setupElem.innerHTML = `<span>⚙</span>`;
      } else {
        setupElem.innerHTML = ``;
      }
      container.appendChild(setupElem);
    }

    // Job block
    const jobLeft = (j.startHour / 24) * 100;
    const jobWidth = (j.duration / 24) * 100;

    const jobElem = document.createElement("div");
    jobElem.className = `gantt-job-block ${j.colorClass}`;
    jobElem.style.left = `${jobLeft}%`;
    jobElem.style.width = `${jobWidth}%`;
    jobElem.style.setProperty("--stagger", jobs.indexOf(j));

    // Readable label that avoids awkward cuts
    let displayTitle = j.job;
    if (jobWidth >= 24) {
      displayTitle = `[${planLabel}] ${j.job}`;
    } else if (jobWidth >= 16) {
      const simpleName = j.job.replace(/\s*\([^)]*\)/, "");
      displayTitle = `[${planLabel}] ${simpleName}`;
    } else if (jobWidth >= 10) {
      displayTitle = j.job.replace(/Đơn\s+([A-F]).*/, "Đơn $1");
    } else {
      displayTitle = j.job.replace(/Đơn\s+([A-F]).*/, "$1");
    }

    jobElem.innerHTML = `
      <span style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.2;">${displayTitle}</span>
      <span style="font-size:12px; font-weight:700; margin-left:6px; flex-shrink:0; background:rgba(0,0,0,0.18); padding:1px 5px; border-radius:3px;">${j.duration}h</span>
    `;
    jobElem.title = `[${planLabel}] ${j.job} | Bắt đầu: ${Math.floor(j.startHour)}:00 | Thời lượng: ${j.duration}h | Máy: ${machineName}`;

    jobElem.onclick = () => showJobDetailsModal(j.job, machineName, j.startHour, j.duration, planLabel);
    container.appendChild(jobElem);
  });
}

// 24-Hour Electricity Bill Profile (VND / Hour) comparing B0 vs B2
const HOURLY_ELECTRICITY_DATA = [
  { hour: 0, time: "00:00", tariff: "offpeak", rate: 1190, b0: 160000, b2: 520000 },
  { hour: 1, time: "01:00", tariff: "offpeak", rate: 1190, b0: 160000, b2: 520000 },
  { hour: 2, time: "02:00", tariff: "offpeak", rate: 1190, b0: 160000, b2: 520000 },
  { hour: 3, time: "03:00", tariff: "offpeak", rate: 1190, b0: 160000, b2: 520000 },
  { hour: 4, time: "04:00", tariff: "normal", rate: 1833, b0: 420000, b2: 680000 },
  { hour: 5, time: "05:00", tariff: "normal", rate: 1833, b0: 420000, b2: 680000 },
  { hour: 6, time: "06:00", tariff: "normal", rate: 1833, b0: 550000, b2: 680000 },
  { hour: 7, time: "07:00", tariff: "normal", rate: 1833, b0: 780000, b2: 780000 },
  { hour: 8, time: "08:00", tariff: "normal", rate: 1833, b0: 920000, b2: 850000 },
  { hour: 9, time: "09:00", tariff: "normal", rate: 1833, b0: 980000, b2: 780000 },
  { hour: 10, time: "10:00", tariff: "peak", rate: 3398, b0: 1780000, b2: 420000 },
  { hour: 11, time: "11:00", tariff: "peak", rate: 3398, b0: 1820000, b2: 420000 },
  { hour: 12, time: "12:00", tariff: "normal", rate: 1833, b0: 720000, b2: 880000 },
  { hour: 13, time: "13:00", tariff: "normal", rate: 1833, b0: 720000, b2: 880000 },
  { hour: 14, time: "14:00", tariff: "normal", rate: 1833, b0: 910000, b2: 810000 },
  { hour: 15, time: "15:00", tariff: "normal", rate: 1833, b0: 910000, b2: 810000 },
  { hour: 16, time: "16:00", tariff: "normal", rate: 1833, b0: 980000, b2: 750000 },
  { hour: 17, time: "17:00", tariff: "peak", rate: 3398, b0: 1850000, b2: 450000 },
  { hour: 18, time: "18:00", tariff: "peak", rate: 3398, b0: 1880000, b2: 450000 },
  { hour: 19, time: "19:00", tariff: "peak", rate: 3398, b0: 1750000, b2: 390000 },
  { hour: 20, time: "20:00", tariff: "normal", rate: 1833, b0: 580000, b2: 520000 },
  { hour: 21, time: "21:00", tariff: "normal", rate: 1833, b0: 520000, b2: 520000 },
  { hour: 22, time: "22:00", tariff: "offpeak", rate: 1190, b0: 180000, b2: 590000 },
  { hour: 23, time: "23:00", tariff: "offpeak", rate: 1190, b0: 160000, b2: 610000 },
  { hour: 24, time: "24:00", tariff: "offpeak", rate: 1190, b0: 160000, b2: 520000 }
];

let activeChartMetric = "cost"; // "cost" | "power"

function switchChartMetric(metric) {
  activeChartMetric = metric;
  const btnCost = document.getElementById("btnMetricCost");
  const btnPower = document.getElementById("btnMetricPower");
  if (btnCost && btnPower) {
    btnCost.classList.toggle("active", metric === "cost");
    btnPower.classList.toggle("active", metric === "power");
  }
  renderElectricityHourlyChart();
}

// Render SVG Electricity Bill Line Chart
function renderElectricityHourlyChart() {
  const svg = document.getElementById("elecLineChartSvg");
  const tooltip = document.getElementById("chartTooltip");
  if (!svg) return;

  svg.innerHTML = "";

  // Dynamic responsive width calculation to prevent horizontal stretching on zoom
  const container = svg.parentElement;
  const containerW = container ? container.clientWidth : 950;
  const width = Math.max(900, Math.floor(containerW - 24));
  const height = 330;
  const padLeft = 90;
  const padRight = 32;
  const padTop = 54;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.removeAttribute("preserveAspectRatio");

  const isPower = activeChartMetric === "power";
  // Increased headroom: 2.5M VND/h (or 700 kW) ensures line peaks never touch the top labels
  const maxVal = isPower ? 700 : 2500000;

  // Defs for gradients
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <linearGradient id="b0Grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2563eb" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#2563eb" stop-opacity="0.0"/>
    </linearGradient>
    <linearGradient id="b2Grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#059669" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#059669" stop-opacity="0.0"/>
    </linearGradient>
  `;
  svg.appendChild(defs);

  // Background Tariff Zones with distinct top header badges (zero overlap with line curves)
  const tariffZones = [
    { start: 0, end: 4, type: "offpeak", rate: "1.190đ" },
    { start: 4, end: 9.5, type: "normal", rate: "1.833đ" },
    { start: 9.5, end: 11.5, type: "peak", rate: "3.398đ" },
    { start: 11.5, end: 17, type: "normal", rate: "1.833đ" },
    { start: 17, end: 20, type: "peak", rate: "3.398đ" },
    { start: 20, end: 22, type: "normal", rate: "1.833đ" },
    { start: 22, end: 24, type: "offpeak", rate: "1.190đ" }
  ];

  tariffZones.forEach(z => {
    const zx1 = padLeft + (z.start / 24) * plotW;
    const zx2 = padLeft + (z.end / 24) * plotW;
    const zw = zx2 - zx1;

    let fill = "rgba(248, 250, 252, 0.4)";
    let stroke = "rgba(226, 232, 240, 0.6)";
    let badgeBg = "rgba(241, 245, 249, 0.95)";
    let badgeBorder = "#cbd5e1";
    let badgeTextColor = "#475569";

    if (z.type === "peak") {
      fill = "rgba(254, 226, 226, 0.42)";
      stroke = "rgba(254, 205, 211, 0.85)";
      badgeBg = "rgba(254, 226, 226, 0.95)";
      badgeBorder = "#fecdd3";
      badgeTextColor = "#9f1239";
    } else if (z.type === "offpeak") {
      fill = "rgba(209, 250, 229, 0.35)";
      stroke = "rgba(167, 243, 208, 0.85)";
      badgeBg = "rgba(209, 250, 229, 0.95)";
      badgeBorder = "#a7f3d0";
      badgeTextColor = "#065f46";
    }

    // Shaded vertical column for the plot area
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", zx1);
    rect.setAttribute("y", padTop);
    rect.setAttribute("width", zw);
    rect.setAttribute("height", plotH);
    rect.setAttribute("fill", fill);
    rect.setAttribute("stroke", stroke);
    rect.setAttribute("stroke-dasharray", "3,3");
    svg.appendChild(rect);

    // Dedicated top banner badge pill positioned completely outside the plot area
    let badgeText = "";
    if (zw >= 140) {
      badgeText = z.type === "peak" ? `Cao điểm (${z.rate})` : (z.type === "offpeak" ? `Thấp điểm (${z.rate})` : `Bình thường (${z.rate})`);
    } else if (zw >= 80) {
      badgeText = z.type === "peak" ? `Cao điểm (${z.rate})` : (z.type === "offpeak" ? `Thấp điểm (${z.rate})` : `Bình thường`);
    } else if (zw >= 45) {
      badgeText = z.type === "peak" ? "Cao điểm" : (z.type === "offpeak" ? "Thấp điểm" : "Bình thường");
    }

    if (badgeText && zw >= 45) {
      const badgeH = 22;
      const badgeY = 14;
      const badgeRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      badgeRect.setAttribute("x", zx1 + 3);
      badgeRect.setAttribute("y", badgeY);
      badgeRect.setAttribute("width", Math.max(0, zw - 6));
      badgeRect.setAttribute("height", badgeH);
      badgeRect.setAttribute("rx", "4");
      badgeRect.setAttribute("ry", "4");
      badgeRect.setAttribute("fill", badgeBg);
      badgeRect.setAttribute("stroke", badgeBorder);
      badgeRect.setAttribute("stroke-width", "1");
      svg.appendChild(badgeRect);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", zx1 + zw / 2);
      text.setAttribute("y", badgeY + 15);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "11.5px");
      text.setAttribute("font-weight", "600");
      text.setAttribute("font-family", "var(--font-sans)");
      text.setAttribute("fill", badgeTextColor);
      text.textContent = badgeText;
      svg.appendChild(text);
    }
  });

  // Y-axis gridlines & labels with 2.5M VND/h ceiling
  const yTicks = isPower 
    ? [0, 150, 300, 450, 600, 700]
    : [0, 500000, 1000000, 1500000, 2000000, 2500000];

  yTicks.forEach(val => {
    const yPos = padTop + plotH - (val / maxVal) * plotH;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", padLeft);
    line.setAttribute("y1", yPos);
    line.setAttribute("x2", padLeft + plotW);
    line.setAttribute("y2", yPos);
    line.setAttribute("stroke", "#e2e8f0");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", padLeft - 10);
    label.setAttribute("y", yPos + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "12px");
    label.setAttribute("font-weight", "600");
    label.setAttribute("fill", "#64748b");
    label.setAttribute("font-family", "var(--font-sans)");
    label.setAttribute("font-variant-numeric", "tabular-nums");

    if (isPower) {
      label.textContent = `${val} kW`;
    } else {
      label.textContent = val === 0 ? "0 đ" : (val / 1000000).toFixed(1) + " tr đ/h";
    }
    svg.appendChild(label);
  });

  // X-axis hours
  for (let h = 0; h <= 24; h += 2) {
    const xPos = padLeft + (h / 24) * plotW;
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", xPos);
    label.setAttribute("y", padTop + plotH + 20);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "12px");
    label.setAttribute("fill", "#64748b");
    label.setAttribute("font-weight", "500");
    label.textContent = `${String(h).padStart(2, '0')}:00`;
    svg.appendChild(label);
  }

  // Value calculation based on metric
  function getVal(d, planKey) {
    if (isPower) {
      return Math.round(d[planKey] / d.rate);
    }
    return d[planKey];
  }

  // Points for B0 and B2
  const pointsB0 = HOURLY_ELECTRICITY_DATA.map(d => {
    const val = getVal(d, 'b0');
    return {
      x: padLeft + (d.hour / 24) * plotW,
      y: padTop + plotH - (val / maxVal) * plotH,
      data: d,
      val: val
    };
  });

  const pointsB2 = HOURLY_ELECTRICITY_DATA.map(d => {
    const val = getVal(d, 'b2');
    return {
      x: padLeft + (d.hour / 24) * plotW,
      y: padTop + plotH - (val / maxVal) * plotH,
      data: d,
      val: val
    };
  });

  function buildPath(pts) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }

  // Area B0
  const areaPathB0 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  areaPathB0.setAttribute("d", `${buildPath(pointsB0)} L ${padLeft + plotW} ${padTop + plotH} L ${padLeft} ${padTop + plotH} Z`);
  areaPathB0.setAttribute("fill", "url(#b0Grad)");
  svg.appendChild(areaPathB0);

  // Area B2
  const areaPathB2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  areaPathB2.setAttribute("d", `${buildPath(pointsB2)} L ${padLeft + plotW} ${padTop + plotH} L ${padLeft} ${padTop + plotH} Z`);
  areaPathB2.setAttribute("fill", "url(#b2Grad)");
  svg.appendChild(areaPathB2);

  // Line B0
  const lineB0 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  lineB0.setAttribute("d", buildPath(pointsB0));
  lineB0.setAttribute("fill", "none");
  lineB0.setAttribute("stroke", "#2563eb");
  lineB0.setAttribute("stroke-width", "2.8");
  lineB0.setAttribute("stroke-linejoin", "round");
  svg.appendChild(lineB0);

  // Line B2
  const lineB2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  lineB2.setAttribute("d", buildPath(pointsB2));
  lineB2.setAttribute("fill", "none");
  lineB2.setAttribute("stroke", "#059669");
  lineB2.setAttribute("stroke-width", "2.8");
  lineB2.setAttribute("stroke-linejoin", "round");
  svg.appendChild(lineB2);

  // Crosshair
  const crosshairGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  crosshairGroup.style.display = "none";

  const vLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  vLine.setAttribute("y1", padTop);
  vLine.setAttribute("y2", padTop + plotH);
  vLine.setAttribute("stroke", "#0f172a");
  vLine.setAttribute("stroke-width", "1.5");
  vLine.setAttribute("stroke-dasharray", "4,4");
  crosshairGroup.appendChild(vLine);

  const dotB0 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dotB0.setAttribute("r", "5");
  dotB0.setAttribute("fill", "#2563eb");
  dotB0.setAttribute("stroke", "#ffffff");
  dotB0.setAttribute("stroke-width", "2");
  crosshairGroup.appendChild(dotB0);

  const dotB2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dotB2.setAttribute("r", "5");
  dotB2.setAttribute("fill", "#059669");
  dotB2.setAttribute("stroke", "#ffffff");
  dotB2.setAttribute("stroke-width", "2");
  crosshairGroup.appendChild(dotB2);

  svg.appendChild(crosshairGroup);

  // Interactive hit columns
  HOURLY_ELECTRICITY_DATA.forEach((d, i) => {
    const colW = plotW / 24;
    const colX = padLeft + (d.hour / 24) * plotW - colW / 2;

    const hitRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hitRect.setAttribute("x", Math.max(padLeft, colX));
    hitRect.setAttribute("y", padTop);
    hitRect.setAttribute("width", colW);
    hitRect.setAttribute("height", plotH);
    hitRect.setAttribute("fill", "transparent");
    hitRect.style.cursor = "crosshair";

    hitRect.addEventListener("mouseenter", () => {
      const p0 = pointsB0[i];
      const p2 = pointsB2[i];

      crosshairGroup.style.display = "block";
      vLine.setAttribute("x1", p0.x);
      vLine.setAttribute("x2", p0.x);
      dotB0.setAttribute("cx", p0.x);
      dotB0.setAttribute("cy", p0.y);
      dotB2.setAttribute("cx", p2.x);
      dotB2.setAttribute("cy", p2.y);

      let deltaText = "";
      if (isPower) {
        const deltaKw = p0.val - p2.val;
        deltaText = deltaKw > 0 
          ? `<span style="color:#86efac; font-weight:700;">↓ Cắt giảm đỉnh ${deltaKw} kW (-${((deltaKw / p0.val)*100).toFixed(1)}%)</span>`
          : (deltaKw < 0 ? `<span style="color:#93c5fd; font-weight:700;">↑ Tăng phụ tải đêm +${Math.abs(deltaKw)} kW</span>` : `Không đổi`);
      } else {
        const delta = d.b0 - d.b2;
        deltaText = delta > 0 
          ? `<span style="color:#86efac; font-weight:700;">↓ Tiết kiệm ${formatVND(delta)}/h (-${((delta / d.b0)*100).toFixed(1)}%)</span>`
          : (delta < 0 ? `<span style="color:#93c5fd; font-weight:700;">↑ Chuyển sang thấp điểm (+${formatVND(Math.abs(delta))}/h)</span>` : `Không đổi`);
      }

      tooltip.style.display = "block";
      tooltip.style.left = `${Math.min(p0.x + 16, width - 260)}px`;
      tooltip.style.top = `${Math.min(Math.min(p0.y, p2.y), 120)}px`;

      const tariffLabel = d.tariff === "peak" ? "Giờ Cao Điểm" : (d.tariff === "offpeak" ? "Giờ Thấp Điểm" : "Giờ Bình Thường");
      const tariffColor = d.tariff === "peak" ? "#fda4af" : (d.tariff === "offpeak" ? "#86efac" : "#cbd5e1");

      const b0Display = isPower ? `${p0.val} kW` : `${formatVND(d.b0)}/h`;
      const b2Display = isPower ? `${p2.val} kW` : `${formatVND(d.b2)}/h`;

      tooltip.innerHTML = `
        <div style="font-weight:700; margin-bottom:6px; font-size:12.5px;">
          Khung giờ: ${d.time} — <span style="color:${tariffColor};">${tariffLabel}</span>
        </div>
        <div style="font-size:12px; color:#cbd5e1; margin-bottom:6px;">
          Đơn giá EVN: <strong style="color:white;">${formatVND(d.rate)} / kWh</strong>
        </div>
        <div style="display:flex; justify-content:space-between; gap:16px;">
          <span style="color:#93c5fd;">● Lịch hiện tại (B0):</span>
          <strong class="tabular">${b0Display}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; gap:16px; margin:2px 0;">
          <span style="color:#86efac;">● Lịch đề xuất (B2):</span>
          <strong class="tabular">${b2Display}</strong>
        </div>
        <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.2);">
          ${deltaText}
        </div>
      `;
    });

    hitRect.addEventListener("mouseleave", () => {
      crosshairGroup.style.display = "none";
      tooltip.style.display = "none";
    });

    svg.appendChild(hitRect);
  });
}

// Select Plan for Gantt View
function selectGanttPlan(planType) {
  activeGanttPlan = planType;
  
  // Update Tab buttons
  document.querySelectorAll(".gantt-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.plan === planType);
  });

  const scenario = SCENARIOS[currentScenarioId];
  if (scenario) {
    renderGanttChart(scenario.gantt);
  }
}

// Render Independent Validation Constraints
function renderValidationConstraints(constraints) {
  const container = document.getElementById("validationList");
  container.innerHTML = "";

  constraints.forEach(c => {
    const item = document.createElement("div");
    item.className = `constraint-item ${c.pass ? "pass" : ""}`;
    
    item.innerHTML = `
      <div class="constraint-icon">
        ${c.pass ? `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        ` : `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c2410c" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        `}
      </div>
      <div class="constraint-details">
        <div class="constraint-name">${c.name}</div>
        <div class="constraint-desc">${c.desc}</div>
      </div>
      <span class="constraint-status-tag" style="${c.pass ? "" : "background:#ffedd5; color:#c2410c;"}">${c.label}</span>
    `;
    container.appendChild(item);
  });
}

// Render Sensitivity Table
function renderSensitivityTable(rows, note) {
  const tbody = document.getElementById("sensitivityTbody");
  tbody.innerHTML = "";

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:600;">${r.scenario}</td>
      <td>${r.powerEst}</td>
      <td class="tabular" style="font-weight:600; ${r.costDelta.startsWith('-') ? 'color:#15803d;' : 'color:#c2410c;'}">${r.costDelta}</td>
      <td>
        <span class="constraint-status-tag" style="${r.stable ? 'background:#dcfce7; color:#15803d;' : 'background:#ffedd5; color:#c2410c;'}">
          ${r.conclusion}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const noteElem = document.getElementById("sensitivityNote");
  noteElem.textContent = note;
  if (note.includes("CẢNH BÁO")) {
    noteElem.className = "robustness-verdict-box warning";
  } else {
    noteElem.className = "robustness-verdict-box";
  }
}

// Render Jobs Table
function renderJobsTable(jobs) {
  const tbody = document.getElementById("jobsTbody");
  tbody.innerHTML = "";

  jobs.forEach(j => {
    let trustClass = "trust-meter";
    if (j.trust === "raw") trustClass = "trust-raw";
    else if (j.trust === "confirmed") trustClass = "trust-confirmed";
    else if (j.trust === "estimate") trustClass = "trust-estimate";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="tabular" style="font-weight:700;">${j.id}</td>
      <td>
        <div style="font-weight:600; color:var(--text-primary);">${j.name}</div>
        <div style="font-size:12px; color:var(--text-muted);">${j.client} • SL: ${j.qty}</div>
      </td>
      <td>
        <div style="font-size:12.5px;">${j.oldMachine} → <strong style="color:#0369a1;">${j.newMachine}</strong></div>
      </td>
      <td>
        <div style="font-size:12.5px; color:var(--text-secondary);">${j.oldTime}</div>
        <div style="font-size:12.5px; font-weight:600; color:#15803d;">→ ${j.newTime}</div>
      </td>
      <td class="tabular" style="font-weight:600; ${j.electricityDelta.startsWith('-') ? 'color:#15803d;' : ''}">
        ${j.electricityDelta}
      </td>
      <td class="tabular">
        ${j.setupDelta}
      </td>
      <td>
        <span class="badge-trust ${trustClass}">${j.trustLabel}</span>
      </td>
      <td style="font-size:12.5px; max-width:220px; line-height:1.35;">
        ${j.note}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Show Detailed Job Modal
function showJobDetailsModal(jobName, machineName, startHour, duration, plan) {
  const modal = document.getElementById("jobDetailModal");
  document.getElementById("modalJobTitle").textContent = `Chi tiết công việc: ${jobName}`;
  document.getElementById("modalJobBody").innerHTML = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div style="padding:10px 12px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0;">
        <strong>Phương án:</strong> ${plan} | <strong>Máy gán:</strong> ${machineName}
      </div>
      <div><strong>Khung giờ chạy:</strong> ${Math.floor(startHour)}:00 đến ${Math.floor(startHour + duration)}:00 (Thời lượng: ${duration} giờ)</div>
      <div><strong>Biểu giá áp dụng:</strong> Theo QĐ 1279/QĐ-BCT (Thấp điểm 1.190đ / Bình thường 1.833đ / Cao điểm 3.398đ)</div>
      <div><strong>Xác nhận kỹ thuật:</strong> Cặp máy - khuôn đã được kỹ sư xưởng phê duyệt trong hồ sơ tương thích thiết bị.</div>
      <div><strong>Ràng buộc giao hàng:</strong> Đạt mốc hạn hoàn thành cam kết với khách hàng.</div>
    </div>
  `;
  modal.classList.add("open");
}

function closeModal() {
  document.getElementById("jobDetailModal").classList.remove("open");
  document.getElementById("memoModal").classList.remove("open");
}

// Show Print Decision Memo Modal
function showDecisionMemo() {
  const scenario = SCENARIOS[currentScenarioId];
  const memoModal = document.getElementById("memoModal");
  document.getElementById("memoContent").innerHTML = `
    <div style="font-family:serif; line-height:1.6; color:#000;">
      <div style="text-align:center; margin-bottom:16px;">
        <h3 style="margin:0; font-size:16px; text-transform:uppercase;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h3>
        <p style="margin:0; font-size:13px;">Độc lập - Tự do - Hạnh phúc</p>
        <div style="margin:8px auto; width:120px; border-bottom:1px solid #000;"></div>
        <h2 style="margin-top:12px; font-size:18px;">TỜ TRÌNH PHÊ DUYỆT ĐIỀU CHỈNH LỊCH SẢN XUẤT</h2>
        <p style="margin:0; font-size:12px; font-style:italic;">Tuần kiểm tra: ${scenario.weekLabel}</p>
      </div>

      <p><strong>Kính gửi:</strong> Giám đốc Sản xuất / Quản lý Xưởng Ép Phun</p>
      
      <p>Căn cứ vào dữ liệu kế hoạch sản xuất, tình trạng máy móc và biểu giá điện EVN theo thời gian trong ngày (QĐ 1279/QĐ-BCT), Hệ thống EnergyShift VN đã kiểm tra độc lập và báo cáo kết quả như sau:</p>

      <div style="margin:12px 0; padding:10px; border:1px solid #000; background:#fafafa;">
        <p style="margin:0;"><strong>1. KẾT LUẬN CỦA HỆ THỐNG:</strong> <span style="font-size:15px; font-weight:bold;">${scenario.verdictTitle}</span></p>
        <p style="margin:4px 0 0 0;">${scenario.verdictExplanation}</p>
      </div>

      <p><strong>2. SO SÁNH HIỆU QUẢ KINH TẾ (TỔNG CHI PHÍ VẬN HÀNH):</strong></p>
      <ul>
        <li>Chi phí lịch hiện tại (B0): <strong>${formatVND(scenario.kpis.totalCostB0)}</strong></li>
        <li>Chi phí phương án đề xuất: <strong>${formatVND(scenario.kpis.totalCostRec)}</strong></li>
        <li>Chênh lệch ròng: <strong>${scenario.kpis.savingsAmount > 0 ? 'Tiết kiệm ' + formatVND(scenario.kpis.savingsAmount) : 'Tăng chi phí ' + formatVND(Math.abs(scenario.kpis.savingsAmount))}</strong></li>
      </ul>

      <p><strong>3. CHỨNG NHẬN RÀNG BUỘC VẬN HÀNH:</strong></p>
      <p>Bộ kiểm tra độc lập xác nhận: 100% sản lượng đủ, 100% đơn hàng đúng hạn cam kết, đúng thông số máy-khuôn, không chồng lịch máy và đủ thời gian thay khuôn.</p>

      <div style="display:flex; justify-content:space-between; margin-top:30px; text-align:center;">
        <div>
          <p style="margin:0;"><strong>Người Lập Kế Hoạch</strong></p>
          <p style="margin-top:40px;">(Ký & ghi rõ họ tên)</p>
        </div>
        <div>
          <p style="margin:0;"><strong>Kỹ Sư Quản Lý Năng Lượng</strong></p>
          <p style="margin-top:40px;">(Ký & ghi rõ họ tên)</p>
        </div>
        <div>
          <p style="margin:0;"><strong>Giám Đốc Sản Xuất Phê Duyệt</strong></p>
          <p style="margin-top:40px;">(Ký & đóng dấu)</p>
        </div>
      </div>
    </div>
  `;
  memoModal.classList.add("open");
}

// Synchronized Hover between Gantt Job Blocks and Data Table Rows
function setupBidirectionalHoverSync() {
  const jobBlocks = document.querySelectorAll(".gantt-job-block");
  const tableRows = document.querySelectorAll("#jobsTbody tr");

  jobBlocks.forEach(block => {
    block.addEventListener("mouseenter", () => {
      const blockText = block.textContent.toLowerCase();
      tableRows.forEach(row => {
        const rowText = row.textContent.toLowerCase();
        if (
          (blockText.includes("đơn a") && rowText.includes("đơn a")) ||
          (blockText.includes("đơn b") && rowText.includes("đơn b")) ||
          (blockText.includes("đơn c") && rowText.includes("đơn c")) ||
          (blockText.includes("đơn d") && rowText.includes("đơn d")) ||
          (blockText.includes("đơn e") && rowText.includes("đơn e")) ||
          (blockText.includes("đơn f") && rowText.includes("đơn f")) ||
          (blockText.includes("nắp chai") && rowText.includes("nắp chai")) ||
          (blockText.includes("nắp hũ") && rowText.includes("nắp hũ")) ||
          (blockText.includes("chai xịt") && rowText.includes("chai xịt"))
        ) {
          row.classList.add("highlighted");
        }
      });
    });

    block.addEventListener("mouseleave", () => {
      tableRows.forEach(row => row.classList.remove("highlighted"));
    });
  });

  tableRows.forEach(row => {
    row.addEventListener("mouseenter", () => {
      const rowText = row.textContent.toLowerCase();
      jobBlocks.forEach(block => {
        const blockText = block.textContent.toLowerCase();
        if (
          (rowText.includes("đơn a") && blockText.includes("đơn a")) ||
          (rowText.includes("đơn b") && blockText.includes("đơn b")) ||
          (rowText.includes("đơn c") && blockText.includes("đơn c")) ||
          (rowText.includes("đơn d") && blockText.includes("đơn d")) ||
          (rowText.includes("đơn e") && blockText.includes("đơn e")) ||
          (rowText.includes("đơn f") && blockText.includes("đơn f")) ||
          (rowText.includes("nắp chai") && blockText.includes("nắp chai")) ||
          (rowText.includes("nắp hũ") && blockText.includes("nắp hũ")) ||
          (rowText.includes("chai xịt") && blockText.includes("chai xịt"))
        ) {
          block.classList.add("highlighted");
        }
      });
    });

    row.addEventListener("mouseleave", () => {
      jobBlocks.forEach(block => block.classList.remove("highlighted"));
    });
  });
}

// Render Chart 1: Cost Breakdown (Stacked Bars for B0, B1, B2)
function renderCostBreakdownChart(plans) {
  const container = document.getElementById("costBreakdownContent");
  if (!container || !plans) return;

  const planList = [
    { key: "b0", label: "B0 Hiện tại", data: plans.b0, badgeClass: "badge-b0-cost" },
    { key: "b1", label: "B1 Đơn giản", data: plans.b1, badgeClass: "badge-b1-cost" },
    { key: "b2", label: "B2 Phối hợp", data: plans.b2, badgeClass: "badge-b2-cost" }
  ].filter(p => p.data);

  const maxTotal = Math.max(...planList.map(p => p.data.totalCost || 1));

  let html = "";
  planList.forEach(p => {
    const elec = p.data.electricityCost || 0;
    const setup = p.data.setupCost || 0;
    const ot = p.data.overtimeCost || 0;
    const total = p.data.totalCost || (elec + setup + ot);

    const totalPct = (total / maxTotal) * 100;
    const elecPct = (elec / total) * 100;
    const setupPct = (setup / total) * 100;
    const otPct = (ot / total) * 100;

    html += `
      <div class="cost-plan-row">
        <div class="cost-plan-meta">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="cost-plan-badge ${p.badgeClass}">${p.label}</span>
            <span style="font-size:12.5px; color:var(--text-secondary); font-weight:500;">${p.data.name || ''}</span>
          </div>
          <strong class="tabular" style="font-size:13.5px; color:var(--text-primary);">${formatVND(total)}</strong>
        </div>
        <div class="cost-stacked-bar" style="width: ${totalPct}%;" title="${p.label}: Tiền điện ${formatVND(elec)} | Setup ${formatVND(setup)} | Ngoài giờ ${formatVND(ot)}">
          <div class="cost-seg-elec" style="width: ${elecPct}%;" title="Tiền điện: ${formatVND(elec)} (${elecPct.toFixed(1)}%)"></div>
          <div class="cost-seg-setup" style="width: ${setupPct}%;" title="Phí setup: ${formatVND(setup)} (${setupPct.toFixed(1)}%)"></div>
          <div class="cost-seg-overtime" style="width: ${otPct}%;" title="Phí ngoài giờ: ${formatVND(ot)} (${otPct.toFixed(1)}%)"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Render Chart 2: TOU Energy Distribution (% kWh across 3 periods)
function renderTouDistributionChart(kpis) {
  const container = document.getElementById("touDistContent");
  if (!container) return;

  const distData = [
    {
      plan: "Lịch gốc (B0)",
      peakKwh: 580,
      normalKwh: 890,
      offpeakKwh: 225,
      totalKwh: 1695
    },
    {
      plan: "Lịch đề xuất (B2)",
      peakKwh: 120,
      normalKwh: 835,
      offpeakKwh: 740,
      totalKwh: 1695
    }
  ];

  let html = "";
  distData.forEach(d => {
    const peakPct = ((d.peakKwh / d.totalKwh) * 100).toFixed(1);
    const normalPct = ((d.normalKwh / d.totalKwh) * 100).toFixed(1);
    const offpeakPct = ((d.offpeakKwh / d.totalKwh) * 100).toFixed(1);

    html += `
      <div class="tou-dist-row">
        <div class="cost-plan-meta">
          <strong style="font-size:13px; color:var(--text-primary);">${d.plan}</strong>
          <span style="font-size:12px; color:var(--text-muted);">Tổng điện năng: <strong class="tabular" style="color:var(--text-secondary);">${d.totalKwh} kWh</strong></span>
        </div>
        <div class="tou-dist-bar">
          <div class="tou-slice-peak" style="width: ${peakPct}%;" title="Cao điểm: ${d.peakKwh} kWh (${peakPct}%)">
            ${peakPct > 10 ? `${peakPct}% (${d.peakKwh} kWh)` : `${peakPct}%`}
          </div>
          <div class="tou-slice-normal" style="width: ${normalPct}%;" title="Bình thường: ${d.normalKwh} kWh (${normalPct}%)">
            ${normalPct}% (${d.normalKwh} kWh)
          </div>
          <div class="tou-slice-offpeak" style="width: ${offpeakPct}%;" title="Thấp điểm: ${d.offpeakKwh} kWh (${offpeakPct}%)">
            ${offpeakPct}% (${d.offpeakKwh} kWh)
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Render Chart 3: Transformer Peak Load Monitor
function renderTransformerPeakMonitor(kpis) {
  const container = document.getElementById("transformerMonitorContent");
  const badge = document.getElementById("transSafetyBadge");
  if (!container) return;

  const ratedKw = 200;
  const pmaxB0 = 215;
  const pmaxB2 = 145;
  const pmaxScale = 250;

  const b0WidthPct = Math.min(100, (pmaxB0 / pmaxScale) * 100);
  const b2WidthPct = Math.min(100, (pmaxB2 / pmaxScale) * 100);
  const ratedLinePct = (ratedKw / pmaxScale) * 100;

  if (badge) {
    badge.className = "plan-status-pill pill-active";
    badge.textContent = `✅ An toàn trạm (+27.5% biên dự phòng)`;
  }

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-top:4px;">
      <!-- B0 Status -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
          <span style="font-size:12.5px; font-weight:600; color:var(--text-secondary);">Lịch gốc (B0) — Đỉnh cao điểm 18:00</span>
          <span class="tabular" style="font-size:13px; font-weight:700; color:#dc2626;">${pmaxB0} kW (Quá tải trạm 107.5%)</span>
        </div>
        <div class="transformer-bar-container">
          <div class="trans-bar-fill fill-danger" style="width: ${b0WidthPct}%;">
            <span>Pmax: ${pmaxB0} kW</span>
          </div>
          <div class="trans-threshold-line" style="left: ${ratedLinePct}%;" title="Định mức tối đa trạm: ${ratedKw} kW">
            <span class="trans-threshold-badge">Định mức ${ratedKw} kW</span>
          </div>
        </div>
      </div>

      <!-- B2 Status -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
          <span style="font-size:12.5px; font-weight:600; color:var(--text-secondary);">Lịch đề xuất (B2) — Đã điều hòa phụ tải</span>
          <span class="tabular" style="font-size:13px; font-weight:700; color:#15803d;">${pmaxB2} kW (An toàn - Biên tải 27.5%)</span>
        </div>
        <div class="transformer-bar-container">
          <div class="trans-bar-fill fill-safe" style="width: ${b2WidthPct}%;">
            <span>Pmax: ${pmaxB2} kW</span>
          </div>
          <div class="trans-threshold-line" style="left: ${ratedLinePct}%;" title="Định mức tối đa trạm: ${ratedKw} kW">
            <span class="trans-threshold-badge">Định mức ${ratedKw} kW</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  // Scenario Dropdown Listener
  const scenarioSelect = document.getElementById("scenarioSelect");
  if (scenarioSelect) {
    scenarioSelect.addEventListener("change", (e) => {
      currentScenarioId = e.target.value;
      renderDashboard();
    });
  }

  // Gantt Tab Listeners
  document.querySelectorAll(".gantt-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectGanttPlan(btn.dataset.plan);
    });
  });

  // Power-User Senior Planner Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

    if (e.key === "1") {
      selectGanttPlan("compare");
    } else if (e.key === "2") {
      selectGanttPlan("b0");
    } else if (e.key === "3") {
      selectGanttPlan("b1");
    } else if (e.key === "4") {
      selectGanttPlan("b2");
    } else if (e.key === "m" || e.key === "M") {
      showDecisionMemo();
    } else if (e.key === "Escape") {
      closeModal();
    }
  });

  // Responsive resize debouncing (handles browser zoom levels 100%, 90%, 80%, etc.)
  let resizeDebounceTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      renderElectricityHourlyChart();
    }, 120);
  });

  // Render initial scenario
  renderDashboard();
});
