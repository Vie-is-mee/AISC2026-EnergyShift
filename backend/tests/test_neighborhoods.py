from copy import deepcopy
import unittest
from backend.b2 import search_b2
from backend.costing import cost_schedule
from backend.tests.test_b2 import coordinated_fixture


class NeighborhoodTests(unittest.TestCase):
    def test_adjacent_order_change_reduces_setup_with_verified_recost(self):
        data=coordinated_fixture()
        data["setup"]["initial_family_by_machine"]["M1"]="B"
        data["jobs"][0]["family"]="A";data["jobs"][1]["family"]="B"
        # Whole-hour processing and zero cleaning time keep the seed feasible.
        for transition in data["setup"]["transitions"]:
            transition["minutes"]=0
            transition["incremental_cost_vnd"]=100000 if transition["from_family"]!=transition["to_family"] else 0
        for window in data["tariff"]["windows"]:window["vnd_per_kwh"]=1000.0
        seed={**cost_schedule(data,data["current_schedule"]),"schedule":deepcopy(data["current_schedule"])}
        self.assertEqual(seed["status"],"COSTED")
        old=search_b2(data,seed,seed)
        new=search_b2(data,seed,seed,neighborhood_limit=4)
        self.assertLess(new["cost"]["total_vnd"],old["cost"]["total_vnd"])
        self.assertTrue(new["origin"].startswith("CP_SAT_SWAP"))
        self.assertEqual(new["verification"]["status"],"PASS")
        self.assertEqual(new["cost"],cost_schedule(data,new["schedule"])["cost"])
        self.assertFalse(new["solver"]["global_optimum_proven"])

    def test_new_machine_domain_cannot_steal_a_mold_still_mounted_elsewhere(self):
        data=coordinated_fixture();data["jobs"]=data["jobs"][:1];data["current_schedule"]=data["current_schedule"][:1]
        data["jobs"][0]["eligible"]["M2"]=deepcopy(data["jobs"][0]["eligible"]["M1"])
        data["jobs"][0]["eligible"]["M2"]["avg_kw"]=1.0
        seed={**cost_schedule(data,data["current_schedule"]),"schedule":deepcopy(data["current_schedule"])}
        result=search_b2(data,seed,seed,neighborhood_limit=4)
        self.assertEqual(result["schedule"][0]["machine_id"],"M1")
        self.assertTrue(any(r["status"]=="INFEASIBLE" for r in result["solver"]["models"]))

    def test_limits_and_timeout_remain_honest(self):
        data=coordinated_fixture();seed={**cost_schedule(data,data["current_schedule"]),"schedule":data["current_schedule"]}
        result=search_b2(data,seed,seed,neighborhood_limit=2,time_limit_seconds=0)
        self.assertLessEqual(result["solver"]["declared_domains"],3)
        self.assertEqual(result["solver"]["optimality"],"NOT_PROVEN")
        for invalid in (-1,25,True):
            with self.assertRaises(ValueError):search_b2(data,seed,seed,neighborhood_limit=invalid)
