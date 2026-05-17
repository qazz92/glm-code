import unittest

from glm_code_testbed.text_stats import TextStats, analyze_text


class TextStatsTest(unittest.TestCase):
    def test_analyze_text_counts_words_characters_and_unique_words(self):
        self.assertEqual(
            analyze_text('GLM Code, GLM tests!'),
            TextStats(words=4, characters=20, unique_words=3),
        )


if __name__ == '__main__':
    unittest.main()
