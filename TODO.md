# BUGS
- wavelet map has some dirty data on the edges because of padding all of the data to 146 timepoints
- I want to change how that data is handled now - I want the ratio to be count(lead)/count(all data)  (ratio of lead to anything else) - Also note that I removed (matrices[frame_idx][j, i] = 1.0 - ratio) line because the opposite pair will appear later and while the data should be complementary we shouldn't edit it ourselves to be 1-ratio. And the wavelet is asymetric in a sense but also there is no need to show the complementary 1-ratio behaviour with two lines they don't convey any extra information. Let's just show one line (make sure its the big one that is shown in the FE - we want to show the arrow in the direction that the other is leading in more. plan this redesign out and make sure to include the update of the skill and CLAUDE.md documentations in this

# FEATURES

- wavelet data


