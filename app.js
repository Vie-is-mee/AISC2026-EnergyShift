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
// ==========================================================================
// Application State
// ==========================================================================
let currentScenarioId = "scenario1";
let activeGanttPlan = "compare"; // "compare", "b0", "b1", "b2"
let activeChartMetric = "cost";   // "cost", "power"

// ===========================================================================
// Manual schedule editing + human confirmation (demo-local, not solver-verified)
// ===========================================================================
const MANUAL_STORE_KEY = "energyshift_manual_workspace_v1";
function loadManualStore() {
  try {
    const data = JSON.parse(localStorage.getItem(MANUAL_STORE_KEY) || "{}");
    return data && typeof data === "object" ? data : {};
  } catch (e) { return {}; }
}
const manualStore = loadManualStore();
manualStore.schedules ||= {};
manualStore.confirmations ||= {};
let validationPlan = "b2";
let editingScheduleUid = null;
let scheduleNewMode = false;
let schedulePreviewDraft = null; // Optional visual preview; never persisted until Save.
let lastScheduleChange = null; // Visible feedback for a committed Gantt change.

function storeManualWorkspace() {
  try { localStorage.setItem(MANUAL_STORE_KEY, JSON.stringify(manualStore)); } catch (e) { /* Memory-only fallback for file previews. */ }
}
function manualPlanKey(scenarioId, plan) { return `${scenarioId}:${plan}`; }
function getModifiedPlans(scenarioId) { return ["b0", "b1", "b2"].filter(plan => isScheduleModified(scenarioId, plan)); }
function isScheduleModified(scenarioId, plan) { return Object.prototype.hasOwnProperty.call(manualStore.schedules, manualPlanKey(scenarioId, plan)); }
function getWorkingJobs(plan, scenarioId = currentScenarioId) {
  const source = manualStore.schedules[manualPlanKey(scenarioId, plan)] ?? SCENARIOS[scenarioId].gantt[plan] ?? [];
  return source.map((job, i) => ({ ...job, _uid: job._uid || `initial-${i}` }));
}
function getWorkingGantt() {
  const gantt = Object.fromEntries(["b0", "b1", "b2"].map(plan => [plan, getWorkingJobs(plan)]));
  if (schedulePreviewDraft && schedulePreviewDraft.scenarioId === currentScenarioId) {
    const { plan, job } = schedulePreviewDraft;
    const i = gantt[plan].findIndex(j => j._uid === job._uid);
    if (i >= 0) gantt[plan][i] = job;
    else gantt[plan].push(job);
  }
  return gantt;
}
function getConfirmations(scenarioId, plan) { return manualStore.confirmations[manualPlanKey(scenarioId, plan)] || {}; }
function clearConfirmationForPlan(plan) { delete manualStore.confirmations[manualPlanKey(currentScenarioId, plan)]; }
function formatHour(hour) {
  const minutes = Math.round(Number(hour) * 60);
  return `${String(Math.floor((minutes / 60) % 24)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}${minutes >= 1440 ? " (+1 ngày)" : ""}`;
}
function parseStartTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return NaN;
  return Number(match[1]) + Number(match[2]) / 60;
}
function safeText(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
}
function writeSchedulePlan(plan, jobs) {
  schedulePreviewDraft = null;
  manualStore.schedules[manualPlanKey(currentScenarioId, plan)] = jobs.map(j => ({
    _uid: j._uid, machine: j.machine, job: j.job, startHour: j.startHour,
    duration: j.duration, setupBefore: j.setupBefore, colorClass: `job-${plan}`
  }));
  clearConfirmationForPlan(plan);
  storeManualWorkspace();
  renderGanttChart(SCENARIOS[currentScenarioId].gantt);
  renderValidationConstraints(SCENARIOS[currentScenarioId].constraints);
  updateOverviewEditNotice();
}
function updateOverviewEditNotice() {
  const box = document.getElementById("overviewEditNotice");
  if (!box) return;
  const plans = getModifiedPlans(currentScenarioId);
  box.hidden = !plans.length;
  if (plans.length) box.textContent = `Lịch ${plans.map(p => p.toUpperCase()).join(", ")} đã điều chỉnh thủ công. Chi phí, KPI, đồ thị phụ tải, bảng điều chuyển và khuyến nghị đang là kết quả của kịch bản gốc, chưa tính lại theo thay đổi.`;
}
function renderScheduleWorkspace() {
  const plan = activeGanttPlan;
  const compare = plan === "compare";
  const workingPlan = compare ? "b2" : plan;
  const jobs = getWorkingJobs(workingPlan);
  const edited = isScheduleModified(currentScenarioId, workingPlan);
  const conflictingUids = getOverlappingJobUids(jobs);
  const status = document.getElementById("scheduleEditStatus");
  const notice = document.getElementById("manualScheduleNotice");
  const count = document.getElementById("scheduleListCount");
  const rows = document.getElementById("scheduleJobRows");
  const addBtn = document.getElementById("newScheduleJobBtn");
  const resetBtn = document.getElementById("resetScheduleBtn");
  const exportBtn = document.getElementById("exportScheduleBtn");
  // Comparison mode is still editable: Add defaults visibly to B2.
  addBtn.disabled = false;
  addBtn.textContent = compare ? "+ Thêm lô vào B2" : "+ Thêm lô";
  exportBtn.disabled = compare;
  if (resetBtn) resetBtn.disabled = compare || !edited;
  if (status) {
    status.className = `manual-state ${edited ? "manual-edited" : ""}`;
    status.textContent = compare ? "Chế độ đối chiếu" : edited ? `${plan.toUpperCase()} · Đã chỉnh sửa` : `${plan.toUpperCase()} · Lịch mẫu`;
  }
  notice.textContent = compare
    ? "Đang so sánh B0 và B2. Bảng lô phía trên thuộc B2; Thêm lô và Sửa sẽ tự chuyển sang B2. Muốn chỉnh B0 hãy chọn nút ‘Lịch Hiện Tại (B0)’ ở phía trên."
    : edited
      ? `Các thay đổi ${plan.toUpperCase()} được giữ trên trình duyệt. Xác nhận ràng buộc cũ đã bị xóa; các chỉ số chi phí và khuyến nghị chưa được tính lại.`
      : `Nhấn vào thanh màu trong lịch hoặc chọn Sửa để cập nhật ${plan.toUpperCase()}. Lịch này là dữ liệu minh họa.`;
  count.textContent = `${jobs.length} lô · ${workingPlan.toUpperCase()}${edited ? " · đã lưu thay đổi" : ""}`;
  rows.innerHTML = "";
  jobs.sort((a, b) => a.startHour - b.startHour || a.machine.localeCompare(b.machine)).forEach(job => {
    const row = document.createElement("tr");
    row.dataset.jobUid = job._uid;
    row.dataset.plan = workingPlan;
    const conflictFlag = conflictingUids.has(job._uid) ? `<span class="schedule-row-conflict" title="Trùng thời gian trên cùng máy (tính cả setup)">⚠ Trùng lịch</span>` : "";
    row.innerHTML = `<td><strong>${safeText(job.job)}</strong>${conflictFlag}</td><td>${safeText(job.machine)}</td><td>${formatHour(job.startHour)}</td><td>${formatHour(job.startHour + job.duration)}</td><td>${Math.round(job.setupBefore * 60)} phút</td>`;
    const action = document.createElement("td");
    const button = document.createElement("button");
    button.className = "manual-btn manual-btn-small";
    button.type = "button";
    button.textContent = "Sửa";
    button.disabled = false;
    button.title = compare ? `Chuyển tới ${workingPlan.toUpperCase()} để sửa` : `Sửa lô thuộc ${workingPlan.toUpperCase()}`;
    button.addEventListener("click", () => {
      if (activeGanttPlan === "compare") selectGanttPlan(workingPlan);
      openScheduleEditor(job._uid, false);
    });
    action.append(button);
    row.appendChild(action);
    rows.appendChild(row);
  });
  renderScheduleIssues(workingPlan, compare);
}
function findScheduleOverlaps(jobs) {
  const collisions = [];
  const grouped = jobs.reduce((result, job) => { (result[job.machine] ||= []).push(job); return result; }, {});
  for (const [machine, entries] of Object.entries(grouped)) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j];
        const aBegin = a.startHour - a.setupBefore, bBegin = b.startHour - b.setupBefore;
        if (aBegin < b.startHour + b.duration - 1e-6 && bBegin < a.startHour + a.duration - 1e-6)
          collisions.push({ machine, a, b });
      }
    }
  }
  return collisions;
}
function getOverlappingJobUids(jobs) {
  const uids = new Set();
  findScheduleOverlaps(jobs).forEach(({ a, b }) => { uids.add(a._uid); uids.add(b._uid); });
  return uids;
}
let scheduleConflictToastTimer = null;
function dismissScheduleConflictToast() {
  const notice = document.getElementById("scheduleConflictToast");
  if (notice) notice.hidden = true;
  clearTimeout(scheduleConflictToastTimer);
}
function showConflictForChangedJob(changedJob, jobs) {
  const collisions = findScheduleOverlaps(jobs).filter(x => x.a._uid === changedJob._uid || x.b._uid === changedJob._uid);
  if (!collisions.length) { dismissScheduleConflictToast(); return; }
  const first = collisions[0], other = first.a._uid === changedJob._uid ? first.b : first.a;
  const text = document.getElementById("scheduleConflictToastText");
  const panel = document.getElementById("scheduleConflictToast");
  if (!panel || !text) return;
  text.textContent = `${changedJob.machine}: “${changedJob.job}” trùng với “${other.job}” (kể cả setup). Hãy dời giờ hoặc chọn máy khác.${collisions.length > 1 ? ` Còn ${collisions.length - 1} xung đột khác.` : ""}`;
  panel.hidden = false;
  clearTimeout(scheduleConflictToastTimer);
  scheduleConflictToastTimer = setTimeout(() => panel.hidden = true, 8500);
}
function calculateScheduleIssues(jobs) {
  const issues = [];
  jobs.forEach(job => {
    if (job.startHour - job.setupBefore < 0) issues.push(`Setup ${job.job} trên ${job.machine} bắt đầu trước 00:00; cần kiểm tra ca trước.`);
    if (job.startHour + job.duration > 24) issues.push(`${job.job} trên ${job.machine} tiếp tục qua ngày hôm sau; cần kiểm tra ca kế tiếp.`);
  });
  findScheduleOverlaps(jobs).forEach(({ machine, a, b }) => {
    issues.push(`${machine}: ${a.job} xung đột với ${b.job} (kể cả setup).`);
  });
  return issues;
}
function renderScheduleIssues(plan, compare) {
  const panel = document.getElementById("scheduleConflictReport");
  const issues = calculateScheduleIssues(getWorkingJobs(plan));
  panel.innerHTML = "";
  const title = document.createElement("h3");
  title.textContent = `Rà soát sơ bộ · ${plan.toUpperCase()}`;
  panel.appendChild(title);
  const desc = document.createElement("p");
  desc.textContent = "Chỉ kiểm tra xung đột thời gian/setup trong dữ liệu Gantt. Chưa kiểm tra sản lượng, máy/khuôn, hạn giao hoặc lịch ca kế tiếp.";
  panel.appendChild(desc);
  const caption = document.createElement("div");
  caption.className = `manual-issue-summary ${issues.length ? "has-issues" : ""}`;
  caption.textContent = issues.length ? `${issues.length} điểm cần rà soát` : "Không thấy chồng lịch nội ngày (kiểm tra sơ bộ)";
  panel.appendChild(caption);
  if (issues.length) {
    const list = document.createElement("ul");
    issues.forEach(issue => { const li = document.createElement("li"); li.textContent = issue; list.appendChild(li); });
    panel.appendChild(list);
  }
  if (compare) {
    const msg = document.createElement("p"); msg.textContent = "Đang hiển thị cảnh báo của B2. Chọn B0 để kiểm tra B0."; panel.appendChild(msg);
  }
}
function openScheduleEditor(uid = null, isNew = false) {
  if (activeGanttPlan === "compare") { selectGanttPlan("b2"); }
  const form = document.getElementById("scheduleEditForm");
  const jobs = getWorkingJobs(activeGanttPlan);
  const job = !isNew && uid !== null ? jobs.find(j => j._uid === uid) : null;
  if (!isNew && !job) { showToast("Không tìm thấy lô cần chỉnh sửa."); return; }
  editingScheduleUid = job?._uid || null;
  scheduleNewMode = isNew;
  schedulePreviewDraft = null;
  document.getElementById("scheduleEditorTitle").textContent = job ? `Sửa: ${job.job}` : "Thêm lô sản xuất";
  const machineSelect = document.getElementById("editJobMachine");
  machineSelect.replaceChildren(...MACHINES_META.map(m => new Option(`${m.name} · ${m.spec.split(" (")[0]}`, m.id)));
  document.getElementById("editJobName").value = job?.job || "";
  machineSelect.value = job?.machine || "M1";
  document.getElementById("editJobStart").value = formatHour(job?.startHour ?? 8).slice(0, 5);
  document.getElementById("editJobDuration").value = job?.duration ?? 2;
  document.getElementById("editJobSetup").value = job?.setupBefore ?? 0.5;
  document.getElementById("deleteScheduleJobBtn").hidden = !job;
  form.hidden = false;
  document.getElementById("schedulePreviewHint").textContent = "Thay đổi dữ liệu để xem trước trực tiếp trên Gantt · bấm Lưu để áp dụng.";
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  document.getElementById("editJobName").focus({ preventScroll: true });
}
function closeScheduleEditor() {
  const hadPreview = !!schedulePreviewDraft;
  schedulePreviewDraft = null;
  editingScheduleUid = null;
  scheduleNewMode = false;
  const form = document.getElementById("scheduleEditForm");
  if (form) form.hidden = true;
  if (hadPreview) renderGanttChart(SCENARIOS[currentScenarioId].gantt);
}
function previewScheduleEditor() {
  const form = document.getElementById("scheduleEditForm");
  if (!form || form.hidden || activeGanttPlan === "compare") return;
  const start = parseStartTime(document.getElementById("editJobStart").value);
  const duration = Number(document.getElementById("editJobDuration").value);
  const setup = Number(document.getElementById("editJobSetup").value);
  const name = document.getElementById("editJobName").value.trim();
  const machine = document.getElementById("editJobMachine").value;
  const valid = name && machine && Number.isFinite(start) && start >= 0 && start < 24
    && Math.round(start * 2) === start * 2 && duration >= 0.5 && duration <= 18
    && Math.round(duration * 2) === duration * 2 && setup >= 0 && setup <= 3;
  schedulePreviewDraft = valid ? {
    scenarioId: currentScenarioId, plan: activeGanttPlan,
    job: { _uid: editingScheduleUid || "preview-new-job", job: name, machine,
      startHour: start, duration, setupBefore: setup, colorClass: `job-${activeGanttPlan}` }
  } : null;
  const draftConflicts = valid ? findScheduleOverlaps([
    ...getWorkingJobs(activeGanttPlan).filter(j => j._uid !== (editingScheduleUid || "preview-new-job")),
    schedulePreviewDraft.job
  ]).filter(x => x.a._uid === schedulePreviewDraft.job._uid || x.b._uid === schedulePreviewDraft.job._uid) : [];
  document.getElementById("schedulePreviewHint").textContent = valid
    ? `Đang xem trước ${activeGanttPlan.toUpperCase()}: ${name} · ${machine} · ${formatHour(start)} · ${duration} giờ. Chưa lưu.${draftConflicts.length ? ` ⚠ Trùng ${draftConflicts.length} lô trên cùng máy.` : ""}`
    : "Nhập đủ tên, máy, giờ theo bước 30 phút và thời lượng hợp lệ để xem trước.";
  renderGanttChart(SCENARIOS[currentScenarioId].gantt);
}
function saveScheduleJob(e) {
  e.preventDefault();
  const plan = activeGanttPlan;
  if (plan === "compare") return;
  const form = document.getElementById("scheduleEditForm");
  if (!form.reportValidity()) return;
  const start = parseStartTime(document.getElementById("editJobStart").value);
  const duration = Number(document.getElementById("editJobDuration").value);
  const setup = Number(document.getElementById("editJobSetup").value);
  const name = document.getElementById("editJobName").value.trim();
  if (!Number.isFinite(start) || start < 0 || start >= 24 || Math.round(start * 2) !== start * 2 || duration < .5 || duration > 18 || setup < 0 || setup > 3 || !name || Math.round(duration * 2) !== duration * 2) {
    showToast("Kiểm tra lại: giờ bắt đầu theo bước 30 phút, thời lượng từ 0,5–18 giờ."); return;
  }
  const jobs = getWorkingJobs(plan);
  const updated = { _uid: editingScheduleUid || `manual-${Date.now()}-${Math.floor(Math.random()*10000)}`, job: name, machine: document.getElementById("editJobMachine").value, startHour: start, duration, setupBefore: setup, colorClass: `job-${plan}` };
  const index = jobs.findIndex(j => j._uid === editingScheduleUid);
  if (index >= 0) jobs[index] = updated; else jobs.push(updated);
  lastScheduleChange = { scenarioId: currentScenarioId, plan, kind: index >= 0 ? "updated" : "added", job: updated };
  writeSchedulePlan(plan, jobs);
  closeScheduleEditor();
  revealChangedScheduleJob(updated._uid, plan);
  const updatedRow = [...document.querySelectorAll("#scheduleJobRows tr")]
    .find(row => row.dataset.jobUid === updated._uid && row.dataset.plan === plan);
  if (updatedRow) updatedRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
  showToast(`${index >= 0 ? "Đã cập nhật" : "Đã thêm"} ${name} · ${plan.toUpperCase()} hiện có ${jobs.length} lô.`);
  showConflictForChangedJob(updated, jobs);
}
function deleteScheduleJob() {
  if (!editingScheduleUid || activeGanttPlan === "compare") return;
  const jobs = getWorkingJobs(activeGanttPlan);
  const target = jobs.find(j => j._uid === editingScheduleUid);
  if (!target || !confirm(`Xóa “${target.job}” khỏi lịch ${activeGanttPlan.toUpperCase()}?`)) return;
  const plan = activeGanttPlan;
  lastScheduleChange = { scenarioId: currentScenarioId, plan, kind: "deleted", job: target };
  writeSchedulePlan(plan, jobs.filter(j => j._uid !== editingScheduleUid));
  closeScheduleEditor();
  document.getElementById("ganttChangeFeedback").scrollIntoView({ behavior: "smooth", block: "nearest" });
  showToast(`Đã xóa ${target.job} khỏi lịch ${plan.toUpperCase()}.`);
}
function shiftScheduleJob(plan, uid, delta) {
  const jobs = getWorkingJobs(plan);
  const job = jobs.find(j => j._uid === uid);
  if (!job) return;
  const target = job.startHour + delta;
  if (target < 0 || target >= 24) { showToast("Giờ bắt đầu phải nằm trong ngày 00:00–23:30."); return; }
  job.startHour = Math.round(target * 2) / 2;
  lastScheduleChange = { scenarioId: currentScenarioId, plan, kind: "updated", job: { ...job } };
  writeSchedulePlan(plan, jobs);
  const shiftedPill = [...document.querySelectorAll(".gantt-job-pill")].find(p => p.dataset.jobUid === uid && p.dataset.plan === plan);
  if (shiftedPill) shiftedPill.focus({ preventScroll: true });
  showToast(`Đã chuyển ${job.job} tới ${formatHour(job.startHour)} trong ${plan.toUpperCase()}.`);
  showConflictForChangedJob(job, jobs);
}
function resetManualSchedule() {
  const plan = activeGanttPlan;
  if (plan === "compare" || !isScheduleModified(currentScenarioId, plan)) return;
  if (!confirm(`Khôi phục lịch mẫu ${plan.toUpperCase()}? Tất cả thay đổi và xác nhận thủ công của phương án này sẽ bị xóa.`)) return;
  lastScheduleChange = null;
  schedulePreviewDraft = null;
  delete manualStore.schedules[manualPlanKey(currentScenarioId, plan)];
  clearConfirmationForPlan(plan);
  storeManualWorkspace();
  closeScheduleEditor();
  renderGanttChart(SCENARIOS[currentScenarioId].gantt);
  renderValidationConstraints(SCENARIOS[currentScenarioId].constraints);
  updateOverviewEditNotice();
  showToast(`Đã khôi phục lịch mẫu ${plan.toUpperCase()}.`);
}
function exportScheduleCSV() {
  if (activeGanttPlan === "compare") return;
  const rows = [["Job","Machine","Start","Duration_hours","Setup_hours"], ...getWorkingJobs(activeGanttPlan).map(j => [j.job,j.machine,formatHour(j.startHour),j.duration,j.setupBefore])];
  const csv = "\uFEFF" + rows.map(row => row.map(cell => { const safe = /^[=+@\-]/.test(String(cell)) ? "'" + String(cell) : String(cell); return `"${safe.replace(/"/g, '""')}"`; }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `EnergyShift_${currentScenarioId}_${activeGanttPlan}_manual.csv`;
  document.body.appendChild(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Đã xuất CSV của lịch đang xem.");
}
function changeValidationPlan(plan) {
  if (!["b0", "b1", "b2"].includes(plan)) return;
  validationPlan = plan;
  renderValidationConstraints(SCENARIOS[currentScenarioId].constraints);
}
function updateManualConfirmation(id, checked) {
  const key = manualPlanKey(currentScenarioId, validationPlan);
  manualStore.confirmations[key] ||= {};
  manualStore.confirmations[key][id] = checked;
  storeManualWorkspace();
  renderValidationConstraints(SCENARIOS[currentScenarioId].constraints);
  const index = SCENARIOS[currentScenarioId].constraints.findIndex(c => c.id === id);
  const nextInput = document.querySelectorAll("#validationList input[type=checkbox]")[index];
  if (nextInput) nextInput.focus({ preventScroll: true });
}
function clearManualConfirmations() {
  delete manualStore.confirmations[manualPlanKey(currentScenarioId, validationPlan)];
  storeManualWorkspace();
  renderValidationConstraints(SCENARIOS[currentScenarioId].constraints);
  showToast(`Đã bỏ các xác nhận thủ công cho ${validationPlan.toUpperCase()}.`);
}

function getStoredTheme() {
  try { return localStorage.getItem("energyshift_theme") || "dark"; } catch (e) { return "dark"; }
}
function saveTheme(theme) {
  try { localStorage.setItem("energyshift_theme", theme); } catch (e) { /* Storage may be unavailable in local previews. */ }
}
let currentTheme = getStoredTheme();

function updateThemeUI(theme) {
  const sunIcon = document.getElementById("themeIconSun");
  const moonIcon = document.getElementById("themeIconMoon");
  if (sunIcon && moonIcon) {
    if (theme === "dark") {
      sunIcon.style.display = "none";
      moonIcon.style.display = "inline-block";
    } else {
      sunIcon.style.display = "inline-block";
      moonIcon.style.display = "none";
    }
  }
}

function toggleAppTheme() {
  currentTheme = (currentTheme === "dark") ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);
  saveTheme(currentTheme);
  updateThemeUI(currentTheme);
  if (typeof renderElectricityHourlyChart === "function") {
    renderElectricityHourlyChart();
  }
  showToast(`Đã chuyển sang giao diện ${currentTheme === "dark" ? "Phòng Điều Hành (Tối)" : "Ban Ngày (Sáng)"}`);
}

// Apply initial theme immediately
document.documentElement.setAttribute("data-theme", currentTheme);
document.addEventListener("DOMContentLoaded", () => {
  updateThemeUI(currentTheme);
});


// ==========================================================================
// Formatting & Helpers
// ==========================================================================
function formatVND(num) {
  return new Intl.NumberFormat('vi-VN').format(num) + " đ";
}

function formatNumber(num) {
  return new Intl.NumberFormat('vi-VN').format(num);
}

// Micro-interaction: Animated Number Increment
function animateNumber(element, start, end, duration = 350, isCurrency = false) {
  if (!element) return;
  const startTime = performance.now();
  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * ease);
    element.textContent = isCurrency ? formatVND(current) : formatNumber(current);
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

// ==========================================================================
// Tab Switching System
// ==========================================================================
function switchMainTab(tabId) {
  // Update Rail Nav Items
  document.querySelectorAll(".rail-item").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
  });

  document.querySelectorAll(".quick-nav-item[data-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
    if (btn.dataset.tab === tabId) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  const active = document.querySelector(`.rail-item[data-tab="${tabId}"]`);
  if (active) {
    document.querySelectorAll(".rail-item").forEach(btn => {
      if (btn === active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
  }
  closeMobileNav();
  const workspace = document.getElementById("workspaceMain");
  if (workspace) workspace.scrollTop = 0;

  // Update Tab Panes
  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.classList.toggle("active", pane.id === tabId);
  });

  // Re-render responsive charts when opening specific tabs
  if (tabId === "tab-gantt") {
    const scenario = SCENARIOS[currentScenarioId];
    if (scenario) renderGanttChart(scenario.gantt);
  } else if (tabId === "tab-loadcurve") {
    renderElectricityHourlyChart();
  }
}

// ==========================================================================
// Revalidate / Sync Data Simulation
// ==========================================================================
function showToast(message) {
  const el = document.getElementById("appToast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove("show"), 3500);
}

function revalidateDashboard() {
  const btn = document.getElementById("btnSyncData");
  if (btn) btn.disabled = true;
  renderDashboard();
  if (btn) btn.disabled = false;
  showToast("Đã tải lại dữ liệu của kịch bản minh họa. Chưa đồng bộ ERP/MES.");
}

function toggleMobileNav(force) {
  const rail = document.getElementById("mainRail");
  const trigger = document.getElementById("menuToggle");
  const open = typeof force === "boolean" ? force : !document.body.classList.contains("mobile-nav-open");
  document.body.classList.toggle("mobile-nav-open", open);
  if (trigger) trigger.setAttribute("aria-expanded", String(open));
  if (rail) rail.setAttribute("aria-hidden", window.matchMedia("(max-width: 900px)").matches ? String(!open) : "false");
  if (open && rail) rail.querySelector(".rail-close")?.focus();
  else if (!open && trigger && window.matchMedia("(max-width: 900px)").matches && rail?.contains(document.activeElement)) trigger.focus();
}
function closeMobileNav() { toggleMobileNav(false); }

// ==========================================================================
// Main Dashboard Renderer
// ==========================================================================
function renderDashboard() {
  const scenario = SCENARIOS[currentScenarioId];
  if (!scenario) return;

  // 1. Update Context Labels
  const periodLabel = document.getElementById("currentPeriodLabel");
  if (periodLabel) periodLabel.textContent = scenario.weekLabel;

  const qualityBar = document.getElementById("qualityBarFill");
  const qualityNum = document.getElementById("qualityNumber");
  if (qualityBar) qualityBar.style.width = `${scenario.readinessScore}%`;
  if (qualityNum) qualityNum.textContent = `${scenario.readinessScore}%`;

  // 2. Render Hero Verdict Command Center
  const heroCard = document.getElementById("verdictHeroCard");
  heroCard.className = `command-verdict-card verdict-${scenario.verdictType}`;

  const verdictBadge = document.getElementById("verdictBadge");
  let badgeClass = "badge-change";
  let badgeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`;

  if (scenario.verdictType === "keep") {
    badgeClass = "badge-keep";
    badgeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  } else if (scenario.verdictType === "simple") {
    badgeClass = "badge-simple";
    badgeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  } else if (scenario.verdictType === "measure") {
    badgeClass = "badge-measure";
    badgeIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  }

  verdictBadge.className = `verdict-badge ${badgeClass}`;
  verdictBadge.innerHTML = `${badgeIcon}<span>${scenario.verdictTitle}</span>`;

  document.getElementById("verdictHeading").textContent = scenario.verdictSubtitle;
  document.getElementById("verdictExplanation").textContent = scenario.verdictExplanation;

  // KPIs
  const kpis = scenario.kpis;
  const selectedCode = scenario.verdictType === "change" ? "b2" : scenario.verdictType === "simple" ? "b1" : "b0";
  const selectedPlan = scenario.plans[selectedCode];
  const basePlan = scenario.plans.b0;
  const displayedSavings = basePlan.totalCost - selectedPlan.totalCost;
  const displayedSavingsPct = basePlan.totalCost ? (displayedSavings / basePlan.totalCost * 100).toFixed(2) : "0.00";
  const costElem = document.getElementById("kpiTotalCost");
  const oldCost = parseInt(costElem.getAttribute("data-raw-cost") || selectedPlan.totalCost, 10);
  costElem.setAttribute("data-raw-cost", selectedPlan.totalCost);
  animateNumber(costElem, oldCost, selectedPlan.totalCost, 400, false);

  const deltaElem = document.getElementById("kpiDeltaCost");
  const planTag = document.getElementById("kpiPlanTag");

  if (scenario.verdictType === "change") planTag.textContent = "PHƯƠNG ÁN B2";
  else if (scenario.verdictType === "simple") planTag.textContent = "PHƯƠNG ÁN B1";
  else if (scenario.verdictType === "keep") planTag.textContent = "LỊCH GỐC B0";
  else planTag.textContent = "B0 · CHỜ ĐO THÊM";

  if (scenario.verdictType === "measure") {
    deltaElem.className = "kpi-delta-pill delta-neutral tabular";
    deltaElem.textContent = "Chưa đủ dữ liệu phê duyệt lịch mới";
  } else if (displayedSavings > 0) {
    deltaElem.className = "kpi-delta-pill delta-positive tabular";
    deltaElem.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      Giảm ${formatVND(displayedSavings)} (-${displayedSavingsPct}%)
    `;
  } else if (displayedSavings < 0) {
    deltaElem.className = "kpi-delta-pill delta-negative tabular";
    deltaElem.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
      Tăng ${formatVND(Math.abs(displayedSavings))} (+${Math.abs(Number(displayedSavingsPct))}%)
    `;
  } else {
    deltaElem.className = "kpi-delta-pill delta-neutral tabular";
    deltaElem.textContent = "Không chênh lệch chi phí";
  }

  const elecElem = document.getElementById("kpiElectricitySaved");
  const oldElec = parseInt(elecElem.getAttribute("data-raw-elec") || kpis.electricitySavings, 10);
  elecElem.setAttribute("data-raw-elec", kpis.electricitySavings);
  animateNumber(elecElem, oldElec, kpis.electricitySavings, 400, false);

  const deltaNote = document.querySelector("#kpiDeltaCostContainer .kpi-sub-note");
  if (deltaNote) deltaNote.textContent = scenario.verdictType === "measure" ? "Đang giữ B0 cho đến khi có số đo" : "so với lịch gốc B0";
  const electricalLabel = elecElem.closest(".kpi-metric-card")?.querySelector(".kpi-label");
  if (electricalLabel) electricalLabel.textContent = scenario.verdictType === "keep" || scenario.verdictType === "measure" ? "TIỀN ĐIỆN CÓ THỂ TIẾT KIỆM (B1/B2)" : "TIỀN ĐIỆN TIẾT KIỆM (KỊCH BẢN)";

  const setupChangeElem = document.getElementById("kpiSetupCostChange");
  const scenarioNotApproved = scenario.verdictType === "keep" || scenario.verdictType === "measure";
  const setupLabel = setupChangeElem.closest(".kpi-metric-card")?.querySelector(".kpi-label");
  if (setupLabel) setupLabel.textContent = scenarioNotApproved ? "PHÍ SETUP CỦA LỊCH ĐANG XEM XÉT" : "CHI PHÍ ĐỔI KHUÔN / SETUP";
  if (kpis.setupCostChange > 0) {
    setupChangeElem.textContent = `+${formatVND(kpis.setupCostChange)}`;
  } else if (kpis.setupCostChange < 0) {
    setupChangeElem.textContent = `-${formatVND(Math.abs(kpis.setupCostChange))}`;
  } else {
    setupChangeElem.textContent = "0 đ";
  }

  document.getElementById("kpiJobsShifted").textContent = `${kpis.jobsShifted}`;
  const checkLabel = document.querySelector(".kpi-subgrid .kpi-metric-card:last-child .kpi-compact-val");
  if (checkLabel) {
    const passed = scenario.constraints.filter(c => c.pass).length;
    checkLabel.innerHTML = `<span>${passed} / ${scenario.constraints.length}</span> <span class="unit">TRONG MẪU</span>`;
    checkLabel.classList.toggle("positive-text", passed === scenario.constraints.length);
    checkLabel.classList.toggle("warning-text", passed !== scenario.constraints.length);
  }
  document.getElementById("kpiPeakKwhReduced").textContent = `${scenarioNotApproved ? "Tiềm năng giảm" : "Cắt giảm"} ${kpis.peakKwhReduced} kWh cao điểm`;

  // 3. Render Three Plan Comparison Cards
  renderPlanCards(scenario.plans);

  // 4. Render Analytics Mini Charts
  renderCostBreakdownChart(scenario.plans);
  renderTouDistributionChart(scenario.kpis);

  // 5. Update Live Energy Circuit Telemetry
  updateCircuitTelemetry(scenario);
}

function updateCircuitTelemetry(scenario) {
  const pmaxLive = document.getElementById("circuitPmaxLive");
  const modeBadge = document.getElementById("circuitModeBadge");
  const tariffChip = document.getElementById("circuitTariffChip");
  const mainCable = document.getElementById("cableGridToSub");

  if (pmaxLive && scenario.kpis) {
    pmaxLive.textContent = `Pmax: ${scenario.verdictType === 'change' ? '145 kW (72.5%)' : '188 kW (94.0%)'}`;
  }
  if (modeBadge) {
    if (scenario.verdictType === 'change') {
      modeBadge.textContent = "TRẠM: 250 kVA · Phụ tải an toàn (-69% Peak)";
      modeBadge.className = "circuit-mode-indicator";
    } else {
      modeBadge.textContent = "TRẠM: 250 kVA · Cảnh báo tải đỉnh";
      modeBadge.className = "circuit-mode-indicator warning-mode";
    }
  }
  if (tariffChip) {
    tariffChip.textContent = `Lưới EVN: ${scenario.verdictType === 'change' ? 'Đã triệt tiêu giờ cao điểm' : '3.398 đ/kWh (Cao điểm)'}`;
  }
  if (mainCable) {
    mainCable.className = scenario.verdictType === 'change' 
      ? "cable-pulse cable-main-pulse pulse-offpeak" 
      : "cable-pulse cable-main-pulse pulse-peak";
  }


  // 5. Render Gantt Chart
  renderGanttChart(scenario.gantt);

  // 6. Render Hourly Electricity Chart
  renderElectricityHourlyChart();

  // 7. Render Transformer Monitor
  renderTransformerPeakMonitor(scenario.kpis);

  // 8. Render Validation Constraints
  renderValidationConstraints(scenario.constraints);

  // 9. Render Sensitivity Table
  renderSensitivityTable(scenario.sensitivity, scenario.sensitivityNote);

  // 10. Render Jobs Table
  renderJobsTable(scenario.jobs);
  updateOverviewEditNotice();
}

// ==========================================================================
// Three-Tier Baseline Cards (B0 vs B1 vs B2)
// ==========================================================================
function renderPlanCards(plans) {
  const container = document.getElementById("plansGrid");
  if (!container) return;
  container.innerHTML = "";

  const planKeys = ["b0", "b1", "b2"];

  planKeys.forEach(key => {
    const plan = plans[key];
    if (!plan) return;

    const card = document.createElement("div");
    const isRecommended = plan.recommended === true;
    card.className = `plan-card ${isRecommended ? "plan-recommended" : ""}`;

    let pillClass = "plan-status-pill";
    if (isRecommended) pillClass += " pill-recommended";
    else if (plan.status.includes("Bị loại") || plan.status.includes("Không kinh tế")) pillClass += " pill-discarded";

    card.innerHTML = `
      <div>
        <div class="plan-header-row">
          <span class="plan-code-badge">${plan.code}</span>
          <span class="${pillClass}">${plan.status}</span>
        </div>
        <h3 class="plan-name">${plan.name}</h3>
        <p class="plan-desc">${plan.desc}</p>
      </div>

      <div class="plan-cost-hero">
        <span class="cost-hero-label">Tổng Chi Phí Vận Hành</span>
        <span class="cost-hero-number tabular">${formatVND(plan.totalCost)}</span>
      </div>

      <div class="plan-cost-breakdown">
        <div class="breakdown-row">
          <span class="breakdown-label">Tiền điện sản xuất (TOU):</span>
          <span class="breakdown-val tabular">${formatVND(plan.electricityCost)}</span>
        </div>
        <div class="breakdown-row">
          <span class="breakdown-label">Chi phí đổi khuôn & chuẩn bị:</span>
          <span class="breakdown-val tabular">${formatVND(plan.setupCost)}</span>
        </div>
        <div class="breakdown-row">
          <span class="breakdown-label">Làm thêm giờ (Overtime ca 3):</span>
          <span class="breakdown-val tabular">${formatVND(plan.overtimeCost)}</span>
        </div>
      </div>

      <button class="btn-plan-select" onclick="selectPlanForView('${plan.code.toLowerCase()}')">
        ${isRecommended ? "Xem Lịch Đề Xuất Này (Khuyến Nghị)" : `Xem Chi Tiết Lịch ${plan.code}`}
      </button>
    `;

    container.appendChild(card);
  });
}

function selectPlanForView(planCode) {
  selectGanttPlan(planCode);
  switchMainTab("tab-gantt");
}

// ==========================================================================
// Cost Structure Stacked Comparison Chart
// ==========================================================================
function renderCostBreakdownChart(plans) {
  const container = document.getElementById("costBreakdownContent");
  if (!container) return;
  container.innerHTML = "";

  const maxCost = Math.max(
    plans.b0?.totalCost || 0,
    plans.b1?.totalCost || 0,
    plans.b2?.totalCost || 0,
    1
  );

  ["b0", "b1", "b2"].forEach(k => {
    const p = plans[k];
    if (!p) return;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";

    const label = document.createElement("div");
    label.style.width = "35px";
    label.style.fontFamily = "var(--font-mono)";
    label.style.fontWeight = "700";
    label.style.fontSize = "12px";
    label.textContent = p.code;

    const barContainer = document.createElement("div");
    barContainer.style.flex = "1";
    barContainer.style.height = "20px";
    barContainer.style.background = "var(--bg-muted)";
    barContainer.style.borderRadius = "var(--radius-xs)";
    barContainer.style.display = "flex";
    barContainer.style.overflow = "hidden";

    const pElec = ((p.electricityCost / maxCost) * 100).toFixed(1);
    const pSetup = ((p.setupCost / maxCost) * 100).toFixed(1);
    const pOver = ((p.overtimeCost / maxCost) * 100).toFixed(1);

    barContainer.innerHTML = `
      <div style="width:${pElec}%; background:#0284c7;" title="Tiền điện: ${formatVND(p.electricityCost)}"></div>
      <div style="width:${pSetup}%; background:#f59e0b;" title="Đổi khuôn: ${formatVND(p.setupCost)}"></div>
      <div style="width:${pOver}%; background:#8b5cf6;" title="Overtime: ${formatVND(p.overtimeCost)}"></div>
    `;

    const totalVal = document.createElement("div");
    totalVal.style.width = "105px";
    totalVal.style.textAlign = "right";
    totalVal.className = "tabular";
    totalVal.style.fontSize = "12px";
    totalVal.style.fontWeight = "700";
    totalVal.textContent = formatVND(p.totalCost);

    row.appendChild(label);
    row.appendChild(barContainer);
    row.appendChild(totalVal);
    container.appendChild(row);
  });
}

// ==========================================================================
// TOU Energy Distribution Chart (% kWh)
// ==========================================================================
function renderTouDistributionChart(kpis) {
  const container = document.getElementById("touDistContent");
  if (!container) return;
  container.innerHTML = "";

  // Mock distribution profiles based on B0 vs Recommended
  const profiles = [
    { label: "Lịch gốc B0", peak: 38, normal: 44, offpeak: 18 },
    { label: "Đề xuất mới", peak: Math.max(8, 38 - Math.round((kpis.peakKwhReduced || 600) / 40)), normal: 42, offpeak: 50 }
  ];

  profiles.forEach(item => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";

    const label = document.createElement("div");
    label.style.width = "90px";
    label.style.fontSize = "12px";
    label.style.fontWeight = "600";
    label.textContent = item.label;

    const barContainer = document.createElement("div");
    barContainer.style.flex = "1";
    barContainer.style.height = "20px";
    barContainer.style.background = "var(--bg-muted)";
    barContainer.style.borderRadius = "var(--radius-xs)";
    barContainer.style.display = "flex";
    barContainer.style.overflow = "hidden";

    barContainer.innerHTML = `
      <div style="width:${item.peak}%; background:#ef4444;" title="Cao điểm: ${item.peak}%"></div>
      <div style="width:${item.normal}%; background:#64748b;" title="Bình thường: ${item.normal}%"></div>
      <div style="width:${item.offpeak}%; background:#10b981;" title="Thấp điểm: ${item.offpeak}%"></div>
    `;

    const summaryText = document.createElement("div");
    summaryText.style.width = "110px";
    summaryText.style.textAlign = "right";
    summaryText.className = "tabular";
    summaryText.style.fontSize = "11.5px";
    summaryText.style.fontWeight = "600";
    summaryText.style.color = "#10b981";
    summaryText.textContent = `Thấp điểm: ${item.offpeak}%`;

    row.appendChild(label);
    row.appendChild(barContainer);
    row.appendChild(summaryText);
    container.appendChild(row);
  });
}

// ==========================================================================
// Interactive Gantt Chart with 24H EVN TOU Bands
// ==========================================================================
const MACHINES_META = [
  { id: "M1", name: "Máy Ép M01", spec: "Haitian Mars 160T (1600 kN)" },
  { id: "M2", name: "Máy Ép M02", spec: "Haitian Mars 160T (1600 kN)" },
  { id: "M3", name: "Máy Ép M03", spec: "Haitian Jupiter 200T (2-Platen)" },
  { id: "M4", name: "Máy Ép M04", spec: "Haitian Jupiter 200T (2-Platen)" },
  { id: "M5", name: "Máy Ép M05", spec: "Haitian Jupiter 250T (Servo Precision)" }
];

function selectGanttPlan(planType) {
  dismissScheduleConflictToast();
  schedulePreviewDraft = null;
  activeGanttPlan = planType;
  document.querySelectorAll(".gantt-control-header .segment-btn[data-plan]").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-plan") === planType);
  });
  closeScheduleEditor();
  const scenario = SCENARIOS[currentScenarioId];
  if (scenario) renderGanttChart(scenario.gantt);
}

function renderGanttChart(ganttData) {
  const container = document.getElementById("ganttLanes");
  if (!container || !ganttData) return;
  container.innerHTML = "";
  // Repaint controls from the current state whenever the schedule tab reappears.
  document.querySelectorAll('.gantt-control-header .segment-btn[data-plan]').forEach(button => {
    const selected = button.dataset.plan === activeGanttPlan;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const editableGantt = getWorkingGantt();
  renderScheduleWorkspace();
  renderNextDayContinuations(editableGantt);
  renderGanttChangeFeedback();

  const EVN_PERIODS = [
    { start: 0, end: 4, type: "stripe-offpeak" },
    { start: 4, end: 9.5, type: "stripe-normal" },
    { start: 9.5, end: 11.5, type: "stripe-peak" },
    { start: 11.5, end: 17, type: "stripe-normal" },
    { start: 17, end: 20, type: "stripe-peak" },
    { start: 20, end: 22, type: "stripe-normal" },
    { start: 22, end: 24, type: "stripe-offpeak" }
  ];

  MACHINES_META.forEach(m => {
    const laneRow = document.createElement("div");
    laneRow.className = "gantt-lane-row";

    // Left machine column
    const metaCol = document.createElement("div");
    metaCol.className = "gantt-lane-machine-meta";
    metaCol.innerHTML = `
      <span class="machine-name-row">${m.name}</span>
      <span class="machine-spec-row">${m.spec}</span>
    `;
    laneRow.appendChild(metaCol);

    // Right track
    const trackCol = document.createElement("div");
    trackCol.className = "gantt-lane-track";

    // 1. Shaded EVN TOU Background Stripes
    const bgStripes = document.createElement("div");
    bgStripes.className = "evn-band-stripes-bg";
    EVN_PERIODS.forEach(p => {
      const w = ((p.end - p.start) / 24) * 100;
      const stripe = document.createElement("div");
      stripe.className = `evn-stripe ${p.type}`;
      stripe.style.width = `${w}%`;
      bgStripes.appendChild(stripe);
    });
    trackCol.appendChild(bgStripes);

    // 2. Render Subtracks based on activeGanttPlan
    if (activeGanttPlan === "compare") {
      // Subtrack B0
      const subB0 = document.createElement("div");
      subB0.className = "gantt-subtrack";
      const jobsB0 = (editableGantt.b0 || []).filter(j => j.machine === m.id);
      renderJobsIntoSubtrack(subB0, jobsB0, "B0", m.name);
      trackCol.appendChild(subB0);

      // Subtrack B2
      const subB2 = document.createElement("div");
      subB2.className = "gantt-subtrack";
      const jobsB2 = (editableGantt.b2 || []).filter(j => j.machine === m.id);
      renderJobsIntoSubtrack(subB2, jobsB2, "B2", m.name);
      trackCol.appendChild(subB2);
    } else {
      const planKey = activeGanttPlan; // "b0", "b1", "b2"
      const sub = document.createElement("div");
      sub.className = "gantt-subtrack";
      const jobs = (editableGantt[planKey] || []).filter(j => j.machine === m.id);
      renderJobsIntoSubtrack(sub, jobs, planKey.toUpperCase(), m.name);
      trackCol.appendChild(sub);
    }

    laneRow.appendChild(trackCol);
    container.appendChild(laneRow);
  });
}
function renderGanttChangeFeedback() {
  const box = document.getElementById("ganttChangeFeedback");
  if (!box) return;
  const change = lastScheduleChange;
  if (!change || change.scenarioId !== currentScenarioId || (activeGanttPlan !== "compare" && change.plan !== activeGanttPlan)) { box.hidden = true; return; }
  const { plan, job, kind } = change;
  const verb = kind === "added" ? "Đã thêm" : kind === "deleted" ? "Đã xóa" : "Đã cập nhật";
  box.hidden = false;
  box.textContent = `${verb} trên ${plan.toUpperCase()}: ${job.job} · ${job.machine} · ${formatHour(job.startHour)}–${formatHour(job.startHour + job.duration)} (${job.duration} giờ). ${kind === "deleted" ? "Thanh đã được xóa khỏi lịch." : "Thanh màu và phần tiếp nối qua ngày mới đã được cập nhật."}`;
}
function revealChangedScheduleJob(uid, plan) {
  // The board can be horizontally scrollable on smaller screens.
  const bar = [...document.querySelectorAll("#ganttLanes .gantt-job-pill")]
    .find(p => p.dataset.jobUid === uid && p.dataset.plan === plan);
  if (!bar) return;
  const board = document.querySelector(".gantt-board-card");
  if (board && board.scrollWidth > board.clientWidth) {
    const b = bar.getBoundingClientRect();
    const r = board.getBoundingClientRect();
    if (b.left < r.left + 20 || b.right > r.right - 20) {
      board.scrollLeft += b.left - r.left - (board.clientWidth - b.width) / 2;
    }
  }
  // Saved state is the new normal; never leave the job highlighted after Save.
  bar.classList.remove("job-pill-updated", "job-pill-preview", "job-pill-edited");
}
function renderNextDayContinuations(gantt) {
  const root = document.getElementById("ganttNextDayPreview");
  if (!root) return;
  root.replaceChildren();
  const plans = activeGanttPlan === "compare" ? ["b0", "b2"] : [activeGanttPlan];
  const overnight = plans.flatMap(plan => (gantt[plan] || [])
    .filter(job => job.startHour + job.duration > 24)
    .map(job => ({ ...job, plan, hoursNextDay: job.startHour + job.duration - 24 })));
  if (!overnight.length) { root.hidden = true; return; }
  root.hidden = false;
  const title = document.createElement("h3"); title.textContent = "↪ Tiếp nối sau 00:00 · Ngày kế tiếp";
  const intro = document.createElement("p"); intro.textContent = "Những khối chạy vượt mốc 24:00 được hiển thị tiếp ở đây. Thay đổi thời lượng sẽ cập nhật cả thanh ngày hôm sau.";
  root.append(title, intro);
  const ruler = document.createElement("div"); ruler.className = "nextday-ruler";
  ruler.innerHTML = '<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>';
  root.append(ruler);
  overnight.forEach(job => {
    const row = document.createElement("div"); row.className = "nextday-entry";
    const text = document.createElement("div"); text.className = "nextday-entry-label";
    text.textContent = `${job.plan.toUpperCase()} · ${job.machine} · ${job.job} — tới ${formatHour(job.startHour + job.duration)}`;
    const track = document.createElement("div"); track.className = "nextday-track";
    const bar = document.createElement("div"); bar.className = `nextday-bar job-pill-${job.plan}`;
    if (schedulePreviewDraft && schedulePreviewDraft.job._uid === job._uid && schedulePreviewDraft.plan === job.plan) bar.classList.add("job-pill-preview");
    bar.style.width = `${(job.hoursNextDay / 24) * 100}%`;
    bar.title = `Lô tiếp tục ${job.hoursNextDay} giờ sang ngày hôm sau`;
    track.appendChild(bar);
    row.append(text, track);
    root.append(row);
  });
}

function renderJobsIntoSubtrack(subtrackElem, jobs, planLabel, machineName) {
  // Manual edits may intentionally create conflicts. Do not let overlapping jobs
  // visually cover one another: assign each an independent vertical track.
  const rowsByUid = new Map();
  const occupiedUntil = [];
  [...jobs].sort((a, b) => (a.startHour - a.setupBefore) - (b.startHour - b.setupBefore))
    .forEach(job => {
      const beginning = Math.max(0, job.startHour - job.setupBefore);
      let row = occupiedUntil.findIndex(end => end <= beginning + 1e-6);
      if (row < 0) { row = occupiedUntil.length; occupiedUntil.push(0); }
      occupiedUntil[row] = Math.min(24, job.startHour + job.duration);
      rowsByUid.set(job._uid, row);
    });
  subtrackElem.style.height = `${Math.max(1, occupiedUntil.length) * 34 - 6}px`;
  const conflictingUids = getOverlappingJobUids(getWorkingJobs(planLabel.toLowerCase()));
  jobs.forEach(job => {
    const rowOffset = (rowsByUid.get(job._uid) || 0) * 34;
    // Setup Wedge
    if (job.setupBefore && job.setupBefore > 0) {
      const setupStart = job.startHour - job.setupBefore;
      const setupLeft = (setupStart / 24) * 100;
      const setupWidth = (job.setupBefore / 24) * 100;

      const wedge = document.createElement("div");
      wedge.className = "gantt-setup-wedge";
      wedge.style.left = `${setupLeft}%`;
      wedge.style.width = `${setupWidth}%`;
      wedge.style.top = `${rowOffset}px`;
      wedge.style.bottom = "auto";
      wedge.style.height = "28px";
      wedge.title = `Setup / Thay khuôn: ${Math.round(job.setupBefore * 60)} phút (${machineName})`;
      subtrackElem.appendChild(wedge);
    }

    // Job Capsule
    const jobLeft = (job.startHour / 24) * 100;
    const remainingBeforeMidnight = Math.max(0, 24 - job.startHour);
    const crossesMidnight = job.duration > remainingBeforeMidnight;
    const jobWidth = (Math.min(job.duration, remainingBeforeMidnight) / 24) * 100;

    let pillStyleClass = "job-pill-b0";
    if (planLabel === "B2") pillStyleClass = "job-pill-b2";
    else if (planLabel === "B1") pillStyleClass = "job-pill-b1";

    const pill = document.createElement("div");
    const isPreview = !!(schedulePreviewDraft && schedulePreviewDraft.job._uid === job._uid && schedulePreviewDraft.plan === planLabel.toLowerCase());
    pill.className = `gantt-job-pill ${pillStyleClass}${isPreview ? " job-pill-preview" : ""}`;
    if (conflictingUids.has(job._uid)) pill.classList.add("job-has-conflict");
    pill.dataset.jobUid = job._uid;
    pill.dataset.plan = planLabel.toLowerCase();
    pill.setAttribute("role", "button");
    pill.tabIndex = 0;
    pill.setAttribute("aria-label", `${job.job}, ${machineName}, lịch ${planLabel}, bắt đầu ${formatHour(job.startHour)}, thời lượng ${job.duration} giờ. Enter xem chi tiết, Alt và phím mũi tên để dịch 30 phút`);
    pill.style.left = `${jobLeft}%`;
    pill.style.width = `${jobWidth}%`;
    pill.style.top = `${rowOffset}px`;
    pill.style.bottom = "auto";
    pill.style.height = "28px";

    pill.innerHTML = `
      <span style="font-family:var(--font-mono); font-weight:700; margin-right:4px;">[${planLabel}]</span>
      <span>${conflictingUids.has(job._uid) ? `<span class="gantt-conflict-flag" title="Trùng thời gian trên cùng máy">! </span>` : ""}${isPreview ? "XEM TRƯỚC · " : ""}${safeText(job.job)} • ${job.duration}h${crossesMidnight ? ` ↪ +${(job.startHour + job.duration - 24).toFixed(1)}h ngày sau` : ""}</span>
    `;
    pill.title = `${job.job}: ${formatHour(job.startHour)} đến ${formatHour(job.startHour + job.duration)}. Nhấp để sửa · Shift+nhấp để xem chi tiết.`;

    const key = planLabel.toLowerCase();
    const showJob = () => {
      // One click should go straight to editing, including from comparison mode.
      // Shift-click retains access to the original read-only job details modal.
      if (schedulePreviewDraft && job._uid === "preview-new-job") return;
      if (activeGanttPlan !== key) selectGanttPlan(key);
      openScheduleEditor(job._uid, false);
    };
    let dragBlockedClick = false;
    pill.addEventListener("click", (e) => {
      if (dragBlockedClick) return;
      if (e.shiftKey) showJobDetailsModal(job.job, machineName, job.startHour, job.duration, planLabel);
      else showJob();
    });
    pill.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showJob(); }
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && activeGanttPlan !== "compare") {
        e.preventDefault();
        shiftScheduleJob(key, job._uid, e.key === "ArrowRight" ? 0.5 : -0.5);
      }
    });
    if (activeGanttPlan !== "compare") {
      let dragStartX = 0, dragOffset = 0, dragging = false;
      pill.addEventListener("pointerdown", e => {
        if (e.pointerType === "touch" || e.button !== 0) return;
        dragStartX = e.clientX; dragOffset = 0; dragging = true;
        pill.setPointerCapture(e.pointerId);
      });
      pill.addEventListener("pointermove", e => {
        if (!dragging) return;
        dragOffset = e.clientX - dragStartX;
        if (Math.abs(dragOffset) > 5) { pill.classList.add("job-dragging"); pill.style.transform = `translateX(${dragOffset}px)`; }
      });
      pill.addEventListener("pointerup", () => {
        if (!dragging) return;
        dragging = false;
        pill.classList.remove("job-dragging");
        pill.style.transform = "";
        if (Math.abs(dragOffset) > 6) {
          dragBlockedClick = true;
          const trackWidth = subtrackElem.getBoundingClientRect().width;
          const steps = Math.round((dragOffset / trackWidth * 24) * 2);
          if (steps !== 0) shiftScheduleJob(key, job._uid, steps / 2);
          setTimeout(() => dragBlockedClick = false, 0);
        }
      });
      pill.addEventListener("pointercancel", () => { dragging = false; pill.style.transform = ""; pill.classList.remove("job-dragging"); });
    }

    subtrackElem.appendChild(pill);
  });
}

// ==========================================================================
// Hourly 24H Electricity & Load Profile SVG Chart
// ==========================================================================
function switchChartMetric(metric) {
  activeChartMetric = metric;
  document.getElementById("btnMetricCost").classList.toggle("active", metric === "cost");
  document.getElementById("btnMetricPower").classList.toggle("active", metric === "power");
  renderElectricityHourlyChart();
}

function renderElectricityHourlyChart() {
  const svg = document.getElementById("elecLineChartSvg");
  if (!svg) return;

  const width = 950;
  const height = 280;
  const padL = 60;
  const padR = 20;
  const padT = 30;
  const padB = 40;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  svg.innerHTML = "";

  // 24H Profile Dataset
  const tariffByHour = [
    1190, 1190, 1190, 1190,
    1833, 1833, 1833, 1833, 1833, 1833,
    3398, 3398,
    1833, 1833, 1833, 1833, 1833,
    3398, 3398, 3398,
    1833, 1833,
    1190, 1190
  ];

  const kwB0 = [
    25, 25, 25, 25, 45, 60, 85, 110, 135, 140, 145, 120,
    95, 105, 115, 120, 130, 145, 140, 130, 95, 60, 40, 30
  ];

  const kwB2 = [
    110, 115, 110, 105, 75, 70, 75, 80, 85, 55, 45, 50,
    85, 90, 95, 95, 90, 50, 45, 55, 75, 85, 105, 110
  ];

  const dataPoints = [];
  for (let h = 0; h < 24; h++) {
    const pB0 = kwB0[h];
    const pB2 = kwB2[h];
    const t = tariffByHour[h];
    const costB0 = pB0 * t;
    const costB2 = pB2 * t;

    dataPoints.push({
      hour: h,
      tariff: t,
      powerB0: pB0,
      powerB2: pB2,
      costB0: costB0,
      costB2: costB2,
      valB0: activeChartMetric === "cost" ? costB0 : pB0,
      valB2: activeChartMetric === "cost" ? costB2 : pB2
    });
  }

  const maxVal = Math.max(...dataPoints.map(d => Math.max(d.valB0, d.valB2))) * 1.15;

  function getX(h) {
    return padL + (h / 23) * plotW;
  }

  function getY(v) {
    return padT + plotH - (v / maxVal) * plotH;
  }

  // 1. Shaded EVN TOU Vertical Background Bands
  const EVN_BANDS = [
    { start: 0, end: 4, label: "Thấp điểm", color: "var(--evn-offpeak-stripe)" },
    { start: 4, end: 9.5, label: "Bình thường", color: "var(--evn-normal-stripe)" },
    { start: 9.5, end: 11.5, label: "Cao điểm sáng", color: "var(--evn-peak-stripe)" },
    { start: 11.5, end: 17, label: "Bình thường", color: "var(--evn-normal-stripe)" },
    { start: 17, end: 20, label: "Cao điểm tối", color: "var(--evn-peak-stripe)" },
    { start: 20, end: 22, label: "Bình thường", color: "var(--evn-normal-stripe)" },
    { start: 22, end: 24, label: "Thấp điểm đêm", color: "var(--evn-offpeak-stripe)" }
  ];

  EVN_BANDS.forEach(b => {
    const x1 = padL + (b.start / 24) * plotW;
    const x2 = padL + (b.end / 24) * plotW;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x1);
    rect.setAttribute("y", padT);
    rect.setAttribute("width", x2 - x1);
    rect.setAttribute("height", plotH);
    rect.setAttribute("fill", b.color);
    svg.appendChild(rect);
  });

  // 2. Grid lines
  const gridCount = 4;
  for (let i = 0; i <= gridCount; i++) {
    const yVal = (maxVal / gridCount) * i;
    const yPos = getY(yVal);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", padL);
    line.setAttribute("x2", width - padR);
    line.setAttribute("y1", yPos);
    line.setAttribute("y2", yPos);
    line.setAttribute("stroke", "var(--border-subtle)");
    line.setAttribute("stroke-dasharray", "3,3");
    svg.appendChild(line);

    // Y Axis label
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", padL - 8);
    text.setAttribute("y", yPos + 4);
    text.setAttribute("text-anchor", "end");
    text.setAttribute("font-family", "var(--font-mono)");
    text.setAttribute("font-size", "10");
    text.setAttribute("fill", "var(--text-muted)");
    text.textContent = activeChartMetric === "cost" ? (yVal >= 1000000 ? `${(yVal / 1000000).toFixed(1)}M` : `${Math.round(yVal / 1000)}k`) : `${Math.round(yVal)} kW`;
    svg.appendChild(text);
  }

  // X Axis Hours
  for (let h = 0; h < 24; h += 2) {
    const xPos = getX(h);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", xPos);
    text.setAttribute("y", height - padB + 18);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-family", "var(--font-mono)");
    text.setAttribute("font-size", "10.5");
    text.setAttribute("fill", "var(--text-muted)");
    text.textContent = `${h < 10 ? "0" + h : h}:00`;
    svg.appendChild(text);
  }

  // 3. Smooth Curve Generator
  function createSmoothPath(points) {
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  }

  const ptsB0 = dataPoints.map(d => ({ x: getX(d.hour), y: getY(d.valB0) }));
  const ptsB2 = dataPoints.map(d => ({ x: getX(d.hour), y: getY(d.valB2) }));

  // Draw Path B0
  const pathB0 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathB0.setAttribute("d", createSmoothPath(ptsB0));
  pathB0.setAttribute("fill", "none");
  pathB0.setAttribute("stroke", "#2563eb");
  pathB0.setAttribute("stroke-width", "2.5");
  pathB0.setAttribute("stroke-linecap", "round");
  svg.appendChild(pathB0);

  // Draw Path B2
  const pathB2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathB2.setAttribute("d", createSmoothPath(ptsB2));
  pathB2.setAttribute("fill", "none");
  pathB2.setAttribute("stroke", "#10b981");
  pathB2.setAttribute("stroke-width", "2.5");
  pathB2.setAttribute("stroke-linecap", "round");
  svg.appendChild(pathB2);

  // 4. Interactive Hover Vertical Cursor
  const cursorLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  cursorLine.setAttribute("y1", padT);
  cursorLine.setAttribute("y2", padT + plotH);
  cursorLine.setAttribute("stroke", "var(--text-primary)");
  cursorLine.setAttribute("stroke-width", "1.5");
  cursorLine.setAttribute("stroke-dasharray", "4,4");
  cursorLine.style.display = "none";
  svg.appendChild(cursorLine);

  const dotB0 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dotB0.setAttribute("r", "4.5");
  dotB0.setAttribute("fill", "#2563eb");
  dotB0.setAttribute("stroke", "#ffffff");
  dotB0.setAttribute("stroke-width", "2");
  dotB0.style.display = "none";
  svg.appendChild(dotB0);

  const dotB2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dotB2.setAttribute("r", "4.5");
  dotB2.setAttribute("fill", "#10b981");
  dotB2.setAttribute("stroke", "#ffffff");
  dotB2.setAttribute("stroke-width", "2");
  dotB2.style.display = "none";
  svg.appendChild(dotB2);

  // Hover Tooltip Trigger
  const tooltip = document.getElementById("chartTooltip");

  svg.onmousemove = (e) => {
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (mouseX - padL) / plotW));
    const h = Math.round(ratio * 23);
    const d = dataPoints[h];

    if (!d) return;

    const xPos = getX(h);
    cursorLine.setAttribute("x1", xPos);
    cursorLine.setAttribute("x2", xPos);
    cursorLine.style.display = "block";

    dotB0.setAttribute("cx", xPos);
    dotB0.setAttribute("cy", getY(d.valB0));
    dotB0.style.display = "block";

    dotB2.setAttribute("cx", xPos);
    dotB2.setAttribute("cy", getY(d.valB2));
    dotB2.style.display = "block";

    tooltip.style.display = "block";
    tooltip.style.left = `${Math.min(xPos + 14, width - 210)}px`;
    tooltip.style.top = `${padT + 10}px`;

    let tariffName = "Bình thường (1.833 đ)";
    if (d.tariff === 3398) tariffName = "Cao điểm (3.398 đ)";
    else if (d.tariff === 1190) tariffName = "Thấp điểm (1.190 đ)";

    // Synchronize Real-time Factory Telemetry HUD
    const hudHour = document.getElementById("hudHourVal");
    const hudTariff = document.getElementById("hudTariffVal");
    const hudB0 = document.getElementById("hudB0Val");
    const hudB2 = document.getElementById("hudB2Val");
    const hudSaving = document.getElementById("hudSavingVal");

    if (hudHour) hudHour.textContent = `${h < 10 ? "0" + h : h}:00 - ${h + 1}:00`;
    if (hudTariff) {
      hudTariff.textContent = tariffName;
      hudTariff.className = d.tariff === 3398 ? "hud-val hud-tariff-peak" : d.tariff === 1190 ? "hud-val hud-tariff-offpeak" : "hud-val hud-tariff-normal";
    }
    if (hudB0) hudB0.textContent = `${d.powerB0} kW · ${formatVND(d.costB0)}/h`;
    if (hudB2) hudB2.textContent = `${d.powerB2} kW · ${formatVND(d.costB2)}/h`;
    if (hudSaving) {
      const deltaKw = d.powerB2 - d.powerB0;
      const deltaPct = d.powerB0 ? ((deltaKw / d.powerB0) * 100).toFixed(1) : 0;
      if (deltaKw < 0) {
        hudSaving.textContent = `↓ ${Math.abs(deltaKw)} kW (${deltaPct}%)`;
        hudSaving.className = "hud-val tabular text-success";
      } else if (deltaKw > 0) {
        hudSaving.textContent = `↑ ${deltaKw} kW (+${deltaPct}%)`;
        hudSaving.className = "hud-val tabular text-highlight";
      } else {
        hudSaving.textContent = "0 kW (Cân bằng)";
        hudSaving.className = "hud-val tabular";
      }
    }

    tooltip.innerHTML = `
      <div style="font-weight:700; font-family:var(--font-mono); margin-bottom:4px;">${h < 10 ? "0" + h : h}:00 - ${h + 1}:00</div>
      <div style="font-size:10.5px; color:#cbd5e1; margin-bottom:4px;">Biểu giá: <strong style="color:#f8fafc;">${tariffName}</strong></div>
      <div style="color:#60a5fa;">B0: <strong class="tabular">${activeChartMetric === "cost" ? formatVND(d.costB0) : d.powerB0 + " kW"}</strong></div>
      <div style="color:#34d399;">B2: <strong class="tabular">${activeChartMetric === "cost" ? formatVND(d.costB2) : d.powerB2 + " kW"}</strong></div>
      <div style="font-size:10px; color:#94a3b8; margin-top:4px; border-top:1px solid #475569; padding-top:2px;">
        Chênh lệch: <strong style="color:#10b981;">${activeChartMetric === "cost" ? "-" + formatVND(d.costB0 - d.costB2) : (d.powerB2 - d.powerB0) + " kW"}</strong>
      </div>
    `;
  };

  svg.onmouseleave = () => {
    cursorLine.style.display = "none";
    dotB0.style.display = "none";
    dotB2.style.display = "none";
    tooltip.style.display = "none";
  };
}

// ==========================================================================
// Transformer Peak Load Monitor
// ==========================================================================
function renderTransformerPeakMonitor(kpis) {
  const container = document.getElementById("transformerMonitorContent");
  if (!container) return;

  const ratedPower = 200; // kW
  const peakB0 = 145; // kW
  const peakB2 = 115; // kW
  const safetyMargin = Math.round(((ratedPower - peakB2) / ratedPower) * 100);

  container.innerHTML = `
    <div style="display:flex; align-items:center; gap:20px; font-size:12px;">
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text-muted);">Công suất đỉnh B0 (Lịch cũ):</span>
          <strong class="tabular">${peakB0} kW / 200 kW (72.5%)</strong>
        </div>
        <div style="height:6px; background:var(--bg-muted); border-radius:3px; overflow:hidden;">
          <div style="width:${(peakB0 / ratedPower) * 100}%; background:#2563eb; height:100%;"></div>
        </div>
      </div>

      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text-muted);">Công suất đỉnh B2 (Đề xuất):</span>
          <strong class="tabular" style="color:#10b981;">${peakB2} kW / 200 kW (57.5%)</strong>
        </div>
        <div style="height:6px; background:var(--bg-muted); border-radius:3px; overflow:hidden;">
          <div style="width:${(peakB2 / ratedPower) * 100}%; background:#10b981; height:100%;"></div>
        </div>
      </div>

      <div style="padding-left:14px; border-left:1px solid var(--border-subtle); min-width:140px;">
        <span style="font-size:10.5px; color:var(--text-muted);">Biên an toàn dự phòng:</span>
        <div class="tabular" style="font-size:16px; font-weight:800; color:#10b981;">+${safetyMargin}%</div>
      </div>
    </div>
  `;
}

// ==========================================================================
// 5 Physical Constraints (Independent Validation Engine)
// ==========================================================================
function renderValidationConstraints(constraints) {
  const container = document.getElementById("validationList");
  if (!container || !constraints) return;
  container.innerHTML = "";
  const checks = getConfirmations(currentScenarioId, validationPlan);
  const edited = isScheduleModified(currentScenarioId, validationPlan);
  const checked = constraints.filter(c => checks[c.id]).length;
  document.getElementById("confirmationProgress").textContent = `${checked}/${constraints.length} đã xác nhận · ${validationPlan.toUpperCase()}`;
  document.getElementById("validationPlanSelect").value = validationPlan;
  const info = document.getElementById("validationConfirmNotice");
  info.textContent = edited
    ? `Lịch ${validationPlan.toUpperCase()} đã chỉnh thủ công. Vui lòng đối chiếu lại: trạng thái bên dưới là minh họa, không phải kết quả kiểm định lịch vừa sửa.`
    : `Đang rà soát ${validationPlan.toUpperCase()} / ${SCENARIOS[currentScenarioId].weekLabel}. Xác nhận được lưu riêng theo kịch bản và phương án trên trình duyệt này.`;
  constraints.forEach((c, idx) => {
    const card = document.createElement("div");
    card.className = `constraint-gate-card ${c.pass ? "gate-pass" : "gate-fail"}${checks[c.id] ? " gate-user-checked" : ""}`;
    const demoStatus = document.createElement("div");
    demoStatus.innerHTML = `<div class="gate-card-header"><span class="gate-id-badge">GATE 0${idx + 1}</span><span class="status-chip ${c.pass ? "chip-pass" : "chip-warn"}">MẪU: ${c.label}</span></div><h3 class="gate-title"></h3><p class="gate-desc"></p>`;
    demoStatus.querySelector(".gate-title").textContent = c.name;
    demoStatus.querySelector(".gate-desc").textContent = c.desc;
    card.appendChild(demoStatus);
    const audit = document.createElement("div");
    audit.className = "gate-card-audit";
    audit.innerHTML = `<span class="audit-label">Nguồn trạng thái:</span><span class="audit-val">Dữ liệu mô phỏng · chưa kiểm định độc lập</span>`;
    card.appendChild(audit);
    const label = document.createElement("label");
    label.className = "gate-confirm-checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(checks[c.id]);
    input.setAttribute("aria-label", `Tôi đã kiểm tra ${c.name} cho ${validationPlan.toUpperCase()}`);
    const words = document.createElement("span");
    words.textContent = "Tôi đã kiểm tra và xác nhận điều kiện này";
    input.addEventListener("change", () => updateManualConfirmation(c.id, input.checked));
    label.append(input,words);
    card.appendChild(label);
    container.appendChild(card);
  });
}

// ==========================================================================
// Sensitivity Analysis Simulation Table
// ==========================================================================
function renderSensitivityTable(rows, note) {
  const tbody = document.getElementById("sensitivityTbody");
  if (!tbody || !rows) return;
  tbody.innerHTML = "";

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong style="font-size:13px;">${r.scenario}</strong></td>
      <td><span class="tabular">${r.powerEst}</span></td>
      <td><strong class="tabular ${r.costDelta.trim().startsWith('+') ? 'warning-text' : 'positive-text'}">${r.costDelta}</strong></td>
      <td><span class="status-chip ${r.stable ? 'chip-pass' : 'chip-warn'}">${r.conclusion}</span></td>
      <td><span class="${r.stable ? 'positive-text' : 'warning-text'}">${r.stable ? 'Ổn định' : 'Chưa ổn định'}</span></td>
    `;
    tbody.appendChild(tr);
  });

  const noteBox = document.getElementById("sensitivityNote");
  if (noteBox) {
    if (note && note.includes("ĐO THÊM")) {
      noteBox.className = "robustness-summary-card warning-box";
    } else {
      noteBox.className = "robustness-summary-card";
    }
    noteBox.innerHTML = `
      <strong>Đánh giá kiểm soát rủi ro:</strong> ${note || "Kết luận ổn định qua cả 3 kịch bản thử nghiệm."}
    `;
  }
}

// ==========================================================================
// Job Dispatch & Trust Matrix Table
// ==========================================================================
function renderJobsTable(jobs) {
  const tbody = document.getElementById("jobsTbody");
  if (!tbody || !jobs) return;
  tbody.innerHTML = "";

  jobs.forEach(j => {
    const tr = document.createElement("tr");

    let trustBadge = "<span class='trust-badge trust-raw'>Gốc ERP</span>";
    if (j.trust === "meter") trustBadge = "<span class='trust-badge trust-meter'>Đo trực tiếp</span>";
    else if (j.trust === "confirmed") trustBadge = "<span class='trust-badge trust-confirmed'>Nhà máy xác nhận</span>";
    else if (j.trust === "estimate") trustBadge = "<span class='trust-badge trust-estimate'>Ước tính kiểm chứng</span>";

    tr.innerHTML = `
      <td><strong class="tabular">${j.id}</strong></td>
      <td>
        <div style="font-weight:600; color:var(--text-primary);">${j.name}</div>
        <div style="font-size:11px; color:var(--text-muted);">${j.client} • SL: ${j.qty}</div>
      </td>
      <td>
        <span class="tabular">${j.oldMachine}</span> → <strong class="tabular" style="color:var(--brand-primary);">${j.newMachine}</strong>
      </td>
      <td>
        <div style="font-size:11.5px; color:var(--text-muted);">${j.oldTime}</div>
        <div style="font-size:11.5px; font-weight:600; color:var(--text-primary);">→ ${j.newTime}</div>
      </td>
      <td><strong class="tabular" style="color:#10b981;">${j.electricityDelta}</strong></td>
      <td><span class="tabular" style="color:${j.setupDelta === "0 đ" ? "var(--text-muted)" : "#f59e0b"};">${j.setupDelta}</span></td>
      <td>${trustBadge}</td>
      <td style="max-width:240px; font-size:11.5px; color:var(--text-secondary);">${j.note}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ==========================================================================
// Modal Handlers & Job Technical Inspection
// ==========================================================================
function showJobDetailsModal(jobName, machineName, startHour, duration, plan) {
  const modal = document.getElementById("jobDetailModal");
  const body = document.getElementById("modalJobBody");
  document.getElementById("modalJobTitle").textContent = `Lô Sản Xuất: ${safeText(jobName)}`;

  body.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px;">
      <div>
        <span style="font-size:11px; color:var(--text-muted);">MÁY ÉP CHẠY:</span>
        <div style="font-weight:700;">${machineName}</div>
      </div>
      <div>
        <span style="font-size:11px; color:var(--text-muted);">PHƯƠNG ÁN:</span>
        <div style="font-weight:700; color:var(--brand-primary);">Phương án ${plan}</div>
      </div>
      <div>
        <span style="font-size:11px; color:var(--text-muted);">THỜI ĐIỂM CHẠY:</span>
        <div class="tabular">${startHour}:00 - ${startHour + duration}:00 (${duration} giờ)</div>
      </div>
      <div>
        <span style="font-size:11px; color:var(--text-muted);">KHUÔN SẢN PHẨM:</span>
        <div style="font-weight:600;">Xem danh mục khuôn của dữ liệu mẫu</div>
      </div>
    </div>
    <div style="padding:10px; background:var(--bg-subtle); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); font-size:12px;">
      <strong>Trạng thái minh họa:</strong> Đây là lô sản xuất mô phỏng. Cần đối chiếu khuôn, lực kẹp, setup và thời hạn với dữ liệu nhà máy trước khi sử dụng thực tế.
    </div>
  `;

  openAccessibleModal(modal);
}

let modalReturnFocus = null;
function openAccessibleModal(modal) {
  modalReturnFocus = document.activeElement;
  modal.classList.add("open");
  document.body.classList.add("modal-open");
  const focusEl = modal.querySelector(".modal-close-icon");
  if (focusEl) focusEl.focus();
}
function closeModal() {
  const hadOpen = document.querySelector(".modal-backdrop.open");
  document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("open"));
  document.body.classList.remove("modal-open");
  if (hadOpen && modalReturnFocus?.isConnected) modalReturnFocus.focus();
}


// ==========================================================================
// Official Executive Decision Memo (Tờ trình Phê duyệt)
// ==========================================================================
function showDecisionMemo() {
  const modal = document.getElementById("memoModal");
  const content = document.getElementById("memoContent");
  const scenario = SCENARIOS[currentScenarioId];
  if (!scenario) return;

  const k = scenario.kpis;
  const chosen = scenario.verdictType === "change" ? "b2" : scenario.verdictType === "simple" ? "b1" : "b0";
  const baseline = scenario.plans.b0;
  const proposed = scenario.plans[chosen];
  const netChange = proposed.totalCost - baseline.totalCost;
  const moneyChange = value => (value > 0 ? "+" : value < 0 ? "−" : "") + formatVND(Math.abs(value));

  content.innerHTML = `
    <div class="official-memo-doc"><div class="memo-demo-warning">${getModifiedPlans(currentScenarioId).length ? "CẢNH BÁO: Có lịch đã chỉnh thủ công; KPI/chi phí, biểu đồ phụ tải và kết luận dưới đây vẫn là số liệu mẫu CHƯA tính lại. " : ""}Xác nhận thủ công: ${Object.values(getConfirmations(currentScenarioId, chosen)).filter(Boolean).length}/5 cho ${chosen.toUpperCase()} (không thay thế kiểm định). BẢN NHÁP MINH HỌA — Chưa có kiểm định độc lập hoặc xác nhận từ nhà máy; không dùng để phê duyệt thực tế.</div>
      <div class="memo-header-grid">
        <div>
          <div class="memo-org-name">CÔNG TY CỔ PHẦN NHỰA KỸ THUẬT TÂN Á</div>
          <div class="memo-dept-name">PHÒNG KẾ HOẠCH & ĐIỀU ĐỘ SẢN XUẤT</div>
          <div class="memo-ref-code">Số: TT-2026/09-KH-C01</div>
        </div>
        <div class="memo-state-motto">
          <div class="motto-country">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div class="motto-sub">Độc lập — Tự do — Hạnh phúc</div>
          <div style="font-size:11px; font-style:italic; margin-top:4px;">TP. Hồ Chí Minh, ngày 17 tháng 10 năm 2026</div>
        </div>
      </div>

      <div class="memo-main-title">TỜ TRÌNH PHÊ DUYỆT ĐIỀU CHỈNH LỊCH SẢN XUẤT</div>
      <div class="memo-main-subtitle">V/v: Tối ưu hóa chi phí vận hành và tiền điện theo biểu giá EVN TOU cho ${scenario.weekLabel}</div>

      <p><strong>Kính gửi:</strong> Giám đốc Sản xuất, Quản đốc Phân xưởng Ép phun C01.</p>

      <div class="memo-section-heading">1. CĂN CỨ VÀ BỐI CẢNH</div>
      <p style="margin-bottom:8px;">
        Căn cứ vào Biểu giá bán điện theo thời gian trong ngày (TOU) quy định tại Quyết định 1279/QĐ-BCT; Căn cứ vào danh mục đơn hàng xuất bán và năng lực máy ép thực tế tại Cụm C01; Mẫu EnergyShift VN tái hiện quy trình so sánh B0/B1/B2 trên dữ liệu giả định cho tuần này; chưa có thẩm định thực tế.
      </p>

      <div class="memo-section-heading">2. KẾT QUẢ PHÂN TÍCH TÀI CHÍNH & HIỆU QUẢ RÒNG</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:12px;">
        <thead>
          <tr style="background:#f1f5f9; border-bottom:1px solid #94a3b8;">
            <th style="padding:6px 10px; text-align:left;">Chỉ Tiêu Chi Phí</th>
            <th style="padding:6px 10px; text-align:right;">Lịch Gốc (B0)</th>
            <th style="padding:6px 10px; text-align:right;">Phương án xem xét (${chosen.toUpperCase()})</th>
            <th style="padding:6px 10px; text-align:right;">Chênh Lệch (Δ)</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 10px;">Tiền điện sản xuất EVN (TOU):</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(scenario.plans.b0.electricityCost)}</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(proposed.electricityCost)}</td>
            <td style="padding:6px 10px; text-align:right; color:#10b981; font-weight:700;" class="tabular">${moneyChange(proposed.electricityCost - baseline.electricityCost)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 10px;">Chi phí đổi khuôn & chuẩn bị máy:</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(scenario.plans.b0.setupCost)}</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(proposed.setupCost)}</td>
            <td style="padding:6px 10px; text-align:right; font-weight:700;" class="tabular">${moneyChange(proposed.setupCost - baseline.setupCost)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 10px;">Chi phí làm thêm ca (Overtime):</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(scenario.plans.b0.overtimeCost)}</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(proposed.overtimeCost)}</td>
            <td style="padding:6px 10px; text-align:right; font-weight:700;" class="tabular">${moneyChange(proposed.overtimeCost - baseline.overtimeCost)}</td>
          </tr>
          <tr style="background:#f8fafc; font-weight:800;">
            <td style="padding:8px 10px;">TỔNG CHI PHÍ VẬN HÀNH:</td>
            <td style="padding:8px 10px; text-align:right;" class="tabular">${formatVND(baseline.totalCost)}</td>
            <td style="padding:8px 10px; text-align:right;" class="tabular">${formatVND(proposed.totalCost)}</td>
            <td style="padding:8px 10px; text-align:right; color:#10b981;" class="tabular">
              ${moneyChange(netChange)}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="memo-section-heading">3. KẾT LUẬN & ĐỀ XUẤT CỦA BỘ PHẬN ĐIỀU ĐỘ</div>
      <p style="margin-bottom:8px;">
        <strong>Kết luận của kịch bản mô phỏng:</strong> <span style="font-weight:800; color:#0284c7;">${scenario.verdictTitle}</span> — ${scenario.verdictSubtitle}.
      </p>
      <p style="margin-bottom:8px;">
        <strong>Trạng thái dữ liệu:</strong> Các kết quả ràng buộc hiện là giá trị minh họa, không phải chứng chỉ xác minh độc lập. ${scenario.verdictType === "measure" ? "Kết luận đang chờ đo điện năng bổ sung; không phê duyệt đổi lịch." : "Cần chạy bộ kiểm định và đối soát với dữ liệu nhà máy trước khi áp dụng."}
      </p>

      <div class="memo-signatures-grid">
        <div>
          <div class="sig-title">NGƯỜI LẬP TỜ TRÌNH</div>
          <div class="sig-role">Chuyên viên kế hoạch</div>
          <div class="sig-name">Nguyễn Võ An Vi</div>
        </div>
        <div>
          <div class="sig-title">TRƯỞNG BỘ PHẬN KỸ THUẬT</div>
          <div class="sig-role">Kỹ sư trưởng xưởng</div>
          <div class="sig-name">Nguyễn Xuân Trường</div>
        </div>
        <div>
          <div class="sig-title">QUẢN ĐỐC NHÀ MÁY</div>
          <div class="sig-role">Phê duyệt chấp thuận</div>
          <div class="sig-name">Lê Văn Thanh Mạnh</div>
        </div>
      </div>
    </div>
  `;

  openAccessibleModal(modal);
}

// ==========================================================================
// Keyboard Shortcuts & Initialization
// ==========================================================================
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeModal(); closeMobileNav(); }
  if (e.key === "Tab") {
    const activeModal = document.querySelector(".modal-backdrop.open");
    if (activeModal) {
      const focusables = [...activeModal.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length);
      if (focusables.length) {
        const first = focusables[0], last = focusables[focusables.length-1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  }
  if ((e.key === "m" || e.key === "M") && !document.querySelector(".modal-backdrop.open") && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    showDecisionMemo();
  }
});

// Close modal when clicking outside
document.querySelectorAll(".modal-backdrop").forEach(b => {
  b.addEventListener("click", (e) => {
    if (e.target === b) closeModal();
  });
});

// ==========================================================================
// Dark Control Room / Precision Light Theme Toggle
// ==========================================================================
function toggleAppTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  applyAppTheme(next);
  saveTheme(next);
}
window.toggleAppTheme = toggleAppTheme;

function applyAppTheme(theme) {
  const sunIcon = document.getElementById("themeIconSun");
  const moonIcon = document.getElementById("themeIconMoon");
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    if (sunIcon) sunIcon.style.display = "none";
    if (moonIcon) moonIcon.style.display = "inline-block";
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    if (sunIcon) sunIcon.style.display = "inline-block";
    if (moonIcon) moonIcon.style.display = "none";
  }
}

function initThemeToggle() {
  const toggleBtn = document.getElementById("themeToggleBtn");
  if (!toggleBtn) return;

  const savedTheme = getStoredTheme();
  applyAppTheme(savedTheme);

  // Theme control calls toggleAppTheme from HTML; register no duplicate handler.
}

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();

  const scenarioSelect = document.getElementById("scenarioSelect");
  if (scenarioSelect) {
    scenarioSelect.addEventListener("change", (e) => {
      currentScenarioId = e.target.value;
      closeScheduleEditor();
      renderDashboard();
    });
  }

  const rail = document.getElementById("mainRail");
  if (rail) rail.setAttribute("aria-hidden", window.matchMedia("(max-width: 900px)").matches ? "true" : "false");
  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 900px)").matches) closeMobileNav();
    else if (rail) rail.setAttribute("aria-hidden", document.body.classList.contains("mobile-nav-open") ? "false" : "true");
  });
  // Initial render
  renderDashboard();
});
