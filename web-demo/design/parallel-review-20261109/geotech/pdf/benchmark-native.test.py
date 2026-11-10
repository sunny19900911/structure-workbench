import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("native", Path(__file__).with_name("benchmark-native.py"))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class Row:
    def __init__(self, cells):
        self.cells = cells


class Table:
    bbox = (0, 0, 20, 30)
    cells = [(0, 0, 20, 10), (0, 10, 10, 30), (10, 10, 20, 20), (10, 20, 20, 30)]
    rows = [Row([cells[0], None]), Row([cells[1], cells[2]]), Row([None, cells[3]])]

    def extract(self):
        return [["桩型", None], ["甲楼", "800"], [None, "1000"]]


class NativeTests(unittest.TestCase):
    def test_spans_follow_rectangles_without_mutation(self):
        table = Table()
        result = native.table_data(table)
        self.assertEqual(result["rows"], [["桩型", "桩型"], ["甲楼", "800"], ["甲楼", "1000"]])
        self.assertEqual(result["cellOrigins"][2][0]["row"], 1)
        self.assertIsNone(table.extract()[2][0])

    def test_unowned_gap_never_inherits_previous_value(self):
        table = Table()
        table.cells = [(0, 0, 20, 10), (0, 10, 10, 20), (10, 10, 20, 20), (10, 20, 20, 30)]
        table.rows = [Row([table.cells[0], None]), Row([table.cells[1], table.cells[2]]), Row([None, table.cells[3]])]
        result = native.table_data(table)
        self.assertEqual(result["rows"][2][0], "")
        self.assertIsNone(result["cellOrigins"][2][0])


if __name__ == "__main__":
    unittest.main()
