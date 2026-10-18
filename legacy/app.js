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
let currentTheme = localStorage.getItem("energyshift_theme") || "light";

// Apply initial theme immediately
document.documentElement.setAttribute("data-theme", currentTheme);

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
// Theme Toggle (Light / Dark Mode)
// ==========================================================================
function initThemeToggle() {
  const btn = document.getElementById("themeToggleBtn");
  const sun = document.getElementById("themeIconSun");
  const moon = document.getElementById("themeIconMoon");

  function updateThemeIcons(theme) {
    if (theme === "dark") {
      sun.style.display = "none";
      moon.style.display = "block";
    } else {
      sun.style.display = "block";
      moon.style.display = "none";
    }
  }

  updateThemeIcons(currentTheme);

  btn.addEventListener("click", () => {
    currentTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", currentTheme);
    localStorage.setItem("energyshift_theme", currentTheme);
    updateThemeIcons(currentTheme);
    renderElectricityHourlyChart();
  });
}

// ==========================================================================
// Revalidate / Sync Data Simulation
// ==========================================================================
function revalidateDashboard() {
  const btn = document.getElementById("btnSyncData");
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 0.8s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    <span>Đang Đối Chiếu ERP/MES...</span>
  `;
  btn.style.pointerEvents = "none";

  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.style.pointerEvents = "auto";
    renderDashboard();
    
    // Quick notification pill
    const qBox = document.getElementById("dataQualityBox");
    qBox.style.transform = "scale(1.05)";
    setTimeout(() => qBox.style.transform = "scale(1)", 200);
  }, 500);
}

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
  const costElem = document.getElementById("kpiTotalCost");
  animateNumber(costElem, 0, kpis.totalCostRec, 350, false);

  const deltaElem = document.getElementById("kpiDeltaCost");
  const planTag = document.getElementById("kpiPlanTag");

  if (scenario.verdictType === "change") planTag.textContent = "PHƯƠNG ÁN B2";
  else if (scenario.verdictType === "simple") planTag.textContent = "PHƯƠNG ÁN B1";
  else if (scenario.verdictType === "keep") planTag.textContent = "LỊCH GỐC B0";
  else planTag.textContent = "CẦN ĐO THÊM";

  if (kpis.savingsAmount > 0) {
    deltaElem.className = "kpi-delta-pill delta-positive tabular";
    deltaElem.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      Giảm ${formatVND(kpis.savingsAmount)} (-${kpis.savingsPct}%)
    `;
  } else if (kpis.savingsAmount < 0) {
    deltaElem.className = "kpi-delta-pill delta-negative tabular";
    deltaElem.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
      Tăng ${formatVND(Math.abs(kpis.savingsAmount))} (+${Math.abs(kpis.savingsPct)}%)
    `;
  } else {
    deltaElem.className = "kpi-delta-pill delta-neutral tabular";
    deltaElem.textContent = "Không chênh lệch chi phí";
  }

  const elecElem = document.getElementById("kpiElectricitySaved");
  animateNumber(elecElem, 0, kpis.electricitySavings, 350, false);

  const setupChangeElem = document.getElementById("kpiSetupCostChange");
  if (kpis.setupCostChange > 0) {
    setupChangeElem.textContent = `+${formatVND(kpis.setupCostChange)}`;
  } else if (kpis.setupCostChange < 0) {
    setupChangeElem.textContent = `-${formatVND(Math.abs(kpis.setupCostChange))}`;
  } else {
    setupChangeElem.textContent = "0 đ";
  }

  document.getElementById("kpiJobsShifted").textContent = `${kpis.jobsShifted}`;
  document.getElementById("kpiPeakKwhReduced").textContent = `Cắt giảm -${kpis.peakKwhReduced} kWh cao điểm`;

  // 3. Render Three Plan Comparison Cards
  renderPlanCards(scenario.plans);

  // 4. Render Analytics Mini Charts
  renderCostBreakdownChart(scenario.plans);
  renderTouDistributionChart(scenario.kpis);

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
  activeGanttPlan = planType;
  document.querySelectorAll(".segmented-control .segment-btn").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-plan") === planType);
  });
  const scenario = SCENARIOS[currentScenarioId];
  if (scenario) renderGanttChart(scenario.gantt);
}

function renderGanttChart(ganttData) {
  const container = document.getElementById("ganttLanes");
  if (!container || !ganttData) return;
  container.innerHTML = "";

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
      const jobsB0 = (ganttData.b0 || []).filter(j => j.machine === m.id);
      renderJobsIntoSubtrack(subB0, jobsB0, "B0", m.name);
      trackCol.appendChild(subB0);

      // Subtrack B2
      const subB2 = document.createElement("div");
      subB2.className = "gantt-subtrack";
      const jobsB2 = (ganttData.b2 || []).filter(j => j.machine === m.id);
      renderJobsIntoSubtrack(subB2, jobsB2, "B2", m.name);
      trackCol.appendChild(subB2);
    } else {
      const planKey = activeGanttPlan; // "b0", "b1", "b2"
      const sub = document.createElement("div");
      sub.className = "gantt-subtrack";
      const jobs = (ganttData[planKey] || []).filter(j => j.machine === m.id);
      renderJobsIntoSubtrack(sub, jobs, planKey.toUpperCase(), m.name);
      trackCol.appendChild(sub);
    }

    laneRow.appendChild(trackCol);
    container.appendChild(laneRow);
  });
}

function renderJobsIntoSubtrack(subtrackElem, jobs, planLabel, machineName) {
  jobs.forEach(job => {
    // Setup Wedge
    if (job.setupBefore && job.setupBefore > 0) {
      const setupStart = job.startHour - job.setupBefore;
      const setupLeft = (setupStart / 24) * 100;
      const setupWidth = (job.setupBefore / 24) * 100;

      const wedge = document.createElement("div");
      wedge.className = "gantt-setup-wedge";
      wedge.style.left = `${setupLeft}%`;
      wedge.style.width = `${setupWidth}%`;
      wedge.title = `Setup / Thay khuôn: ${Math.round(job.setupBefore * 60)} phút (${machineName})`;
      subtrackElem.appendChild(wedge);
    }

    // Job Capsule
    const jobLeft = (job.startHour / 24) * 100;
    const jobWidth = (job.duration / 24) * 100;

    let pillStyleClass = "job-pill-b0";
    if (planLabel === "B2") pillStyleClass = "job-pill-b2";
    else if (planLabel === "B1") pillStyleClass = "job-pill-b1";

    const pill = document.createElement("div");
    pill.className = `gantt-job-pill ${pillStyleClass}`;
    pill.style.left = `${jobLeft}%`;
    pill.style.width = `${jobWidth}%`;

    pill.innerHTML = `
      <span style="font-family:var(--font-mono); font-weight:700; margin-right:4px;">[${planLabel}]</span>
      <span>${job.job} • ${job.duration}h</span>
    `;

    pill.addEventListener("click", () => {
      showJobDetailsModal(job.job, machineName, job.startHour, job.duration, planLabel);
    });

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

  constraints.forEach((c, idx) => {
    const card = document.createElement("div");
    card.className = `constraint-gate-card ${c.pass ? "gate-pass" : "gate-fail"}`;

    card.innerHTML = `
      <div>
        <div class="gate-card-header">
          <span class="gate-id-badge">GATE 0${idx + 1}</span>
          <span class="status-chip ${c.pass ? "chip-pass" : "chip-warn"}">${c.label}</span>
        </div>
        <h3 class="gate-title">${c.name}</h3>
        <p class="gate-desc">${c.desc}</p>
      </div>

      <div class="gate-card-audit">
        <span class="audit-label">Cơ chế kiểm tra:</span>
        <span class="audit-val">Thẩm định độc lập 100%</span>
      </div>
    `;

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
      <td><strong class="tabular" style="color:#10b981;">${r.costDelta}</strong></td>
      <td><span class="status-chip chip-pass">${r.conclusion}</span></td>
      <td><span class="positive-text">Ổn định</span></td>
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
  document.getElementById("modalJobTitle").textContent = `Lô Sản Xuất: ${jobName}`;

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
        <div style="font-weight:600;">Khuôn 8 Lòng (Mold MK-8C-PP)</div>
      </div>
    </div>
    <div style="padding:10px; background:var(--bg-subtle); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); font-size:12px;">
      <strong>Đánh giá kỹ thuật:</strong> Công việc được phân bổ hợp lệ theo tiêu chuẩn tương thích lực kẹp khuôn và thời gian làm mát. Đảm bảo 100% thời gian giao hàng.
    </div>
  `;

  modal.classList.add("open");
}

function closeModal() {
  document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("open"));
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

  content.innerHTML = `
    <div class="official-memo-doc">
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
        Căn cứ vào Biểu giá bán điện theo thời gian trong ngày (TOU) quy định tại Quyết định 1279/QĐ-BCT; Căn cứ vào danh mục đơn hàng xuất bán và năng lực máy ép thực tế tại Cụm C01; Hệ thống EnergyShift VN đã tiến hành thẩm định và đối chứng phương án sản xuất cho tuần này.
      </p>

      <div class="memo-section-heading">2. KẾT QUẢ PHÂN TÍCH TÀI CHÍNH & HIỆU QUẢ RÒNG</div>
      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:12px;">
        <thead>
          <tr style="background:#f1f5f9; border-bottom:1px solid #94a3b8;">
            <th style="padding:6px 10px; text-align:left;">Chỉ Tiêu Chi Phí</th>
            <th style="padding:6px 10px; text-align:right;">Lịch Gốc (B0)</th>
            <th style="padding:6px 10px; text-align:right;">Lịch Đề Xuất (${scenario.plans.b2?.recommended ? "B2" : (scenario.plans.b1?.recommended ? "B1" : "B0")})</th>
            <th style="padding:6px 10px; text-align:right;">Chênh Lệch (Δ)</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 10px;">Tiền điện sản xuất EVN (TOU):</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(scenario.plans.b0.electricityCost)}</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(scenario.plans[scenario.verdictType === "change" ? "b2" : (scenario.verdictType === "simple" ? "b1" : "b0")].electricityCost)}</td>
            <td style="padding:6px 10px; text-align:right; color:#10b981; font-weight:700;" class="tabular">-${formatVND(k.electricitySavings)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 10px;">Chi phí đổi khuôn & chuẩn bị máy:</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(scenario.plans.b0.setupCost)}</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(scenario.plans[scenario.verdictType === "change" ? "b2" : (scenario.verdictType === "simple" ? "b1" : "b0")].setupCost)}</td>
            <td style="padding:6px 10px; text-align:right; font-weight:700;" class="tabular">+${formatVND(k.setupCostChange)}</td>
          </tr>
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px 10px;">Chi phí làm thêm ca (Overtime):</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(scenario.plans.b0.overtimeCost)}</td>
            <td style="padding:6px 10px; text-align:right;" class="tabular">${formatVND(scenario.plans[scenario.verdictType === "change" ? "b2" : (scenario.verdictType === "simple" ? "b1" : "b0")].overtimeCost)}</td>
            <td style="padding:6px 10px; text-align:right; font-weight:700;" class="tabular">0 đ</td>
          </tr>
          <tr style="background:#f8fafc; font-weight:800;">
            <td style="padding:8px 10px;">TỔNG CHI PHÍ VẬN HÀNH:</td>
            <td style="padding:8px 10px; text-align:right;" class="tabular">${formatVND(k.totalCostB0)}</td>
            <td style="padding:8px 10px; text-align:right;" class="tabular">${formatVND(k.totalCostRec)}</td>
            <td style="padding:8px 10px; text-align:right; color:#10b981;" class="tabular">
              ${k.savingsAmount > 0 ? "-" + formatVND(k.savingsAmount) + " (" + k.savingsPct + "%)" : (k.savingsAmount < 0 ? "+" + formatVND(Math.abs(k.savingsAmount)) : "0 đ")}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="memo-section-heading">3. KẾT LUẬN & ĐỀ XUẤT CỦA BỘ PHẬN ĐIỀU ĐỘ</div>
      <p style="margin-bottom:8px;">
        <strong>Khuyến nghị chính thức:</strong> <span style="font-weight:800; color:#0284c7;">${scenario.verdictTitle}</span> — ${scenario.verdictSubtitle}.
      </p>
      <p style="margin-bottom:8px;">
        <strong>Xác nhận điều kiện vật lý:</strong> Toàn bộ 5/5 ràng buộc bắt buộc (đủ sản lượng, 100% đúng hạn giao hàng, đúng cặp máy - khuôn đã xác nhận, không chồng lịch và đủ thời gian setup) đã được bộ kiểm tra độc lập chứng nhận đạt chuẩn.
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

  modal.classList.add("open");
}

// ==========================================================================
// Keyboard Shortcuts & Initialization
// ==========================================================================
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
  if ((e.key === "m" || e.key === "M") && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
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
  localStorage.setItem("energyshift_theme", next);
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

  const savedTheme = localStorage.getItem("energyshift_theme") || "light";
  applyAppTheme(savedTheme);

  toggleBtn.addEventListener("click", toggleAppTheme);
}

document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();

  const scenarioSelect = document.getElementById("scenarioSelect");
  if (scenarioSelect) {
    scenarioSelect.addEventListener("change", (e) => {
      currentScenarioId = e.target.value;
      renderDashboard();
    });
  }

  // Initial render
  renderDashboard();
});
